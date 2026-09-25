import * as THREE from 'three/webgpu';
import {
  pass,
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
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

/**
 * Flou « gueule de bois » : rendu net + version floutée (gaussienne), mélangés selon la
 * distance au joueur reconstruite depuis la profondeur. Net près du joueur, flou au-delà.
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
  private readonly blurNode;
  private target = 1;
  private strength = 1;
  private blurActive = true;
  private readonly tmp = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    opts: { strength: number; radius: number; sharpRadius: number },
  ) {
    this.strength = opts.strength;
    this.sharpRadius.value = opts.sharpRadius;
    this.falloff.value = 1.2 + opts.sharpRadius * 0.4;
    this.scenePass = pass(scene, camera);
    const color = this.scenePass.getTextureNode('output');
    const depth = this.scenePass.getTextureNode('depth');

    // Rayon du noyau proportionnel à l'intensité du mode
    // Deux passes chaînées à rayon modéré : flou fort mais sans motif en grille
    const radius = uniform(opts.radius / 2);
    const first = gaussianBlur(color, radius, 6, { resolutionScale: 0.5 });
    this.blurNode = gaussianBlur(first, radius, 6, { resolutionScale: 0.5 });

    const screenUV = uv();
    const d = depth.sample(screenUV).r;
    const viewPos = getViewPosition(screenUV, d, this.projInv);
    const dist = length(viewPos.sub(this.playerView));
    const f = smoothstep(this.sharpRadius, this.sharpRadius.add(this.falloff), dist).mul(this.amount);

    // Léger dédoublement de l'image floue qui « tangue » (vision trouble)
    const wobble = vec2(sin(time.mul(0.9)), sin(time.mul(1.3).add(1.7))).mul(0.014).mul(this.amount);
    const ghost = this.blurNode.getTextureNode().sample(screenUV.add(wobble));
    const doubled = mix(this.blurNode, ghost, 0.5);
    // Lendemain de fête : couleurs délavées et lumière trop vive au loin
    const lum = dot(doubled.rgb, vec3(0.299, 0.587, 0.114));
    const blurred = vec4(mix(doubled.rgb, vec3(lum), 0.3).mul(1.12), 1);

    const mixed = mix(color, blurred, f);
    // Vignette discrète tant que les lunettes manquent
    const vig = smoothstep(0.45, 0.95, length(screenUV.sub(0.5)).mul(1.4)).mul(this.amount).mul(0.35);
    const out = vec4(mix(mixed.rgb, vec3(0.35, 0.22, 0.3), vig), float(1));

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
      const step = (this.strength / 1.0) * dt; // ~1 s de transition
      this.amount.value = a > this.target ? Math.max(this.target, a - step) : Math.min(this.target, a + step);
    }
    // Une fois net, on se passe complètement de la passe de flou
    if (this.blurActive && this.amount.value === 0) {
      this.blurActive = false;
      this.pipeline.outputNode = this.scenePass;
      this.pipeline.needsUpdate = true;
    }
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.blurNode.dispose();
    this.scenePass.dispose();
    this.pipeline.dispose();
  }
}
