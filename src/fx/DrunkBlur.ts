import * as THREE from 'three/webgpu';
import {
  pass,
  mrt,
  output,
  normalView,
  directionToColor,
  colorToDirection,
  sample,
  uniform,
  uv,
  mix,
  smoothstep,
  getViewPosition,
  float,
  vec3,
  vec4,
  length,
  sin,
  time,
  vec2,
  dot,
  pow,
  max,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

/**
 * Post-process complet : occlusion ambiante (GTAO), étalonnage « petit matin », puis
 * flou « gueule de bois » : net près du joueur, flou au-delà (distance reconstruite
 * depuis la profondeur), qui disparaît quand on trouve ses lunettes.
 */
export class DrunkBlur {
  readonly pipeline: THREE.RenderPipeline;
  /** 0 = net partout, 1 = flou maximal du mode. */
  readonly amount = uniform(1);
  readonly sharpRadius = uniform(3);
  readonly falloff = uniform(2.5);
  private readonly playerView = uniform(new THREE.Vector3());
  private readonly projInv = uniform(new THREE.Matrix4());
  private readonly scenePass;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly sharpOut;
  private target = 1;
  private strength = 1;
  private blurActive = true;
  private readonly tmp = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    opts: { strength: number; radius: number; sharpRadius: number; ao: boolean },
  ) {
    this.strength = opts.strength;
    this.sharpRadius.value = opts.sharpRadius;
    this.falloff.value = 1.2 + opts.sharpRadius * 0.4;

    this.scenePass = pass(scene, camera);
    const color = this.scenePass.getTextureNode('output');
    const depth = this.scenePass.getTextureNode('depth');
    const screenUV = uv();
    let withAO = color.rgb;

    // --- Occlusion ambiante (qualité haute seulement) ---
    if (opts.ao) {
      this.scenePass.setMRT(mrt({ output, normal: directionToColor(normalView) }));
      const normalTex = this.scenePass.getTextureNode('normal');
      const sceneNormal = sample((st) => colorToDirection(normalTex.sample(st)));
      const aoPass = ao(depth, sceneNormal, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.9;
      aoPass.thickness.value = 1.2;
      aoPass.distanceFallOff.value = 0.8;
      aoPass.scale.value = 1.1;
      aoPass.samples.value = 12;
      // L'AO brute est bruitée : un léger flou la lisse
      const aoSmooth = gaussianBlur(aoPass.getTextureNode(), uniform(1), 3, { resolutionScale: 0.5 });
      this.disposables.push(aoPass, aoSmooth);
      withAO = color.rgb.mul(mix(float(0.45), float(1), aoSmooth.r));
    }

    // --- Étalonnage : ombres lavande, hautes lumières dorées, un peu plus de saturation ---
    const lum = dot(withAO, vec3(0.2126, 0.7152, 0.0722));
    const shadowTint = pow(max(float(1).sub(lum.mul(1.6)), float(0)), float(2)).mul(vec3(0.014, 0.008, 0.026));
    const warm = mix(vec3(1), vec3(1.07, 1.0, 0.9), smoothstep(0.35, 1.4, lum));
    const saturated = mix(vec3(lum), withAO, 1.12);
    const graded = saturated.mul(warm).add(shadowTint);
    const baseVig = smoothstep(0.55, 1.05, length(screenUV.sub(0.5)).mul(1.35)).mul(0.18);
    const gradedV = graded.mul(float(1).sub(baseVig));
    this.sharpOut = vec4(gradedV, float(1));

    // --- Flou « gueule de bois » : deux passes chaînées, rayon modéré (pas de grille) ---
    const radius = uniform(opts.radius / 2);
    const first = gaussianBlur(this.sharpOut, radius, 6, { resolutionScale: 0.5 });
    const blurNode = gaussianBlur(first, radius, 6, { resolutionScale: 0.5 });
    this.disposables.push(first, blurNode);

    const d = depth.sample(screenUV).r;
    const viewPos = getViewPosition(screenUV, d, this.projInv);
    const dist = length(viewPos.sub(this.playerView));
    const f = smoothstep(this.sharpRadius, this.sharpRadius.add(this.falloff), dist).mul(this.amount);

    // Léger dédoublement qui tangue (vision trouble)
    const wobble = vec2(sin(time.mul(0.9)), sin(time.mul(1.3).add(1.7))).mul(0.014).mul(this.amount);
    const ghost = blurNode.getTextureNode().sample(screenUV.add(wobble));
    const doubled = mix(blurNode, ghost, 0.5);
    // Lendemain de fête : couleurs délavées et lumière trop vive au loin
    const bl = dot(doubled.rgb, vec3(0.299, 0.587, 0.114));
    const blurred = mix(doubled.rgb, vec3(bl), 0.3).mul(1.12);

    const mixed = mix(gradedV, blurred, f);
    const vig = smoothstep(0.45, 0.95, length(screenUV.sub(0.5)).mul(1.4)).mul(this.amount).mul(0.35);
    const out = vec4(mix(mixed, vec3(0.35, 0.22, 0.3), vig), float(1));

    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputNode = out;
    this.amount.value = opts.strength;
    this.target = opts.strength;
  }

  /** Lunettes trouvées : le flou disparaît en ~1 s. */
  clear(): void {
    this.target = 0;
  }

  get value(): number {
    return this.amount.value;
  }

  update(dt: number, playerWorld: THREE.Vector3): void {
    this.projInv.value.copy(this.camera.projectionMatrixInverse);
    this.tmp.copy(playerWorld);
    this.tmp.y += 1.1;
    this.tmp.applyMatrix4(this.camera.matrixWorldInverse);
    this.playerView.value.copy(this.tmp);

    const a = this.amount.value;
    if (a !== this.target) {
      const step = this.strength * dt; // ~1 s de transition
      this.amount.value = a > this.target ? Math.max(this.target, a - step) : Math.min(this.target, a + step);
    }
    // Une fois net, on se passe complètement des passes de flou
    if (this.blurActive && this.amount.value === 0) {
      this.blurActive = false;
      this.pipeline.outputNode = this.sharpOut;
      this.pipeline.needsUpdate = true;
    }
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.scenePass.dispose();
    this.pipeline.dispose();
  }
}
