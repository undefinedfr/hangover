import * as THREE from 'three/webgpu';
import { isLite } from '../core/Quality';
import { color, mix, positionLocal, smoothstep, pow, max, float, vec3, mx_fractal_noise_float, time, Fn, texture, vec2 } from 'three/tsl';


/**
 * PCF déterministe 3×3 : le filtre par défaut fait tourner ses échantillons avec un bruit
 * par pixel, visible en grain sur les surfaces lisses.
 */
const gridPCF = (mapSize: number) => Fn((inputs: { depthTexture: THREE.DepthTexture; shadowCoord: THREE.Node<'vec3'> }) => {
  const { depthTexture, shadowCoord } = inputs;
  const texel = float(1.2 / mapSize);
  let sum: THREE.Node<'float'> = float(0);
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const uv = shadowCoord.xy.add(vec2(x, y).mul(texel));
      sum = sum.add(texture(depthTexture, uv).compare(shadowCoord.z).x);
    }
  }
  return sum.div(9);
});

/** Ciel de petit matin, soleil bas, ombres longues qui suivent le joueur. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly sunOffset = new THREE.Vector3(-60, 38, -45);
  private readonly sky: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene, private readonly shadowMap = 2048) {
    const horizon = color(0xffc49a);
    const zenith = color(0x7fb2e6);
    const ground = color(0xd9b8c4);

    const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const h = positionLocal.normalize().y;
    const up = pow(max(h, float(0)), float(0.55));
    const skyBase = mix(mix(ground, horizon, smoothstep(-0.25, 0.0, h)), zenith, up);
    // Nuages de petit matin : bruit fractal projeté sur un plafond, étiré à l'horizontale
    const dir = positionLocal.normalize();
    const proj = dir.xz.div(max(dir.y, float(0.04)).add(0.12)).mul(1.4);
    const n = mx_fractal_noise_float(vec3(proj.x.mul(0.55), proj.y.mul(1.5), time.mul(0.004)), isLite() ? 2 : 4, 2.0, 0.5);
    const cloud = smoothstep(0.05, 0.45, n).mul(smoothstep(0.02, 0.22, h)).mul(0.85);
    const cloudLit = mix(color(0xffe0cc), color(0xb9a7c9), smoothstep(0.2, 0.9, n));
    skyMat.colorNode = mix(skyBase, cloudLit, cloud);
    skyMat.fog = false;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Soleil levant visible à l'horizon
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(30, 16, 8),
      Object.assign(new THREE.MeshBasicNodeMaterial({ color: 0xfff1c9 }), { fog: false }),
    );
    sunDisc.position.copy(this.sunOffset).normalize().multiplyScalar(820);
    this.sky.add(sunDisc);

    scene.fog = new THREE.Fog(0xf2c6a8, 60, 260);

    const hemi = new THREE.HemisphereLight(0xffd9b8, 0x6b7fa8, 1.3);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xffc98f, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMap, shadowMap);
    (this.sun.shadow as unknown as { filterNode: unknown }).filterNode = gridPCF(shadowMap);
    const s = this.sun.shadow.camera;
    s.left = -45;
    s.right = 45;
    s.top = 45;
    s.bottom = -45;
    s.near = 1;
    s.far = 220;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.2;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Les ombres ne sont calculées que dans une zone autour du joueur. */
  follow(target: THREE.Vector3, camera: THREE.Camera): void {
    // Aligne sur la grille des texels pour éviter le scintillement
    const snap = 90 / this.shadowMap;
    const x = Math.round(target.x / snap) * snap;
    const z = Math.round(target.z / snap) * snap;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    this.sky.position.copy(camera.position);
  }

  dispose(): void {
    this.scene.remove(this.sky);
  }
}
