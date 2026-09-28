import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  float,
  floor,
  fract,
  hash,
  length,
  max,
  mix,
  mx_noise_float,
  positionGeometry,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Le héros : modèle humain réaliste (MakeHuman, CC0) construit par scripts/character/build_hero.py.
 * Sweat à capuche gris (capuche relevée), tutu rose, une basket et une chaussure de ville,
 * vomi sur le sweat. Animation 100 % procédurale sur les os (repos sans rotation).
 */

export interface HeroPose {
  thighL: number;
  kneeL: number;
  thighR: number;
  kneeR: number;
  footL: number;
  footR: number;
  armL: number;
  armR: number;
  elbowL: number;
  elbowR: number;
  /** Écart des bras au corps (rad). */
  armOut: number;
  lean: number;
  roll: number;
  twist: number;
  headNod: number;
  headRoll: number;
  bob: number;
}

export const REST_POSE: HeroPose = {
  thighL: 0,
  kneeL: 0,
  thighR: 0,
  kneeR: 0,
  footL: 0,
  footR: 0,
  armL: 0,
  armR: 0,
  elbowL: -0.15,
  elbowR: -0.15,
  armOut: 0.1,
  lean: 0,
  roll: 0,
  twist: 0,
  headNod: 0,
  headRoll: 0,
  bob: 0,
};

interface Extras {
  height: number;
  hipY: number;
  neckY: number;
  kneeY: number;
  eyesY: number;
  headY: number;
  chestZ: number;
}

let cached: Promise<{ scene: THREE.Group; extras: Extras }> | null = null;
let loaded: { scene: THREE.Group; extras: Extras } | null = null;

/** Précharge le fichier (appelé au démarrage du jeu). */
export function preloadHero(): Promise<{ scene: THREE.Group; extras: Extras }> {
  if (!cached) {
    const url = `${import.meta.env.BASE_URL}models/hero.glb`;
    cached = new GLTFLoader().loadAsync(url).then((g) => {
      loaded = {
        scene: g.scene as unknown as THREE.Group,
        extras: (g.scene.getObjectByName('hero')?.userData ?? {}) as Extras,
      };
      return loaded;
    });
  }
  return cached;
}

// ---------------------------------------------------------------- matériaux

function hoodieMaterial(ex: Extras): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, side: THREE.DoubleSide });
  const p = positionGeometry;
  const heather = mx_noise_float(p.mul(55)).mul(0.035).add(mx_noise_float(p.mul(7)).mul(0.035)).add(1);
  const base = color(0x8a8e94).mul(heather);
  // Bande côtelée en bas et aux poignets
  const hem = float(1).sub(smoothstep(ex.hipY + 0.06, ex.hipY + 0.075, p.y));
  const cuff = smoothstep(0.52, 0.55, abs(p.x));
  const ribs = hem.add(cuff).clamp(0, 1).mul(smoothstep(0.3, 0.5, fract(p.x.add(p.z).mul(90))).mul(0.14));
  // Poche kangourou : couture en trapèze sur le ventre
  const py = p.y.sub(ex.hipY);
  const front = smoothstep(ex.chestZ - 0.09, ex.chestZ - 0.05, p.z);
  const halfW = float(0.13).sub(py.sub(0.08).mul(0.35));
  const seam = max(
    float(1).sub(smoothstep(0.0, 0.004, abs(py.sub(0.26)))).mul(smoothstep(0.004, 0.0, abs(p.x).sub(halfW))),
    float(1).sub(smoothstep(0.0, 0.004, abs(abs(p.x).sub(halfW)))).mul(smoothstep(0.08, 0.09, py)).mul(smoothstep(0.265, 0.255, py)),
  ).mul(front);
  const cloth = base.mul(float(1).sub(ribs)).mul(float(1).sub(seam.mul(0.35)));

  // Vomi : part du col et coule en deux traînées sur le ventre
  const n1 = mx_noise_float(p.mul(28));
  const n2 = mx_noise_float(p.mul(75).add(3.1));
  const top = ex.neckY - 0.06;
  const blob = float(0.07).add(n1.mul(0.022)).sub(length(vec2(p.x.sub(0.015), p.y.sub(top - 0.03).mul(1.1))));
  const drip = (x0: number, len: number, w: number) => {
    const y1 = top - len;
    const t = clamp(p.y.sub(y1).div(len), 0, 1);
    const cx = float(x0).add(float(top).sub(p.y).mul(0.06));
    const inY = smoothstep(y1 - 0.01, y1 + 0.02, p.y).mul(float(1).sub(smoothstep(top - 0.02, top, p.y)));
    return float(w).mul(t.mul(0.7).add(0.3)).add(n2.mul(0.005)).sub(abs(p.x.sub(cx))).mul(inY).sub(float(1).sub(inY).mul(0.1));
  };
  const shape = max(blob, max(drip(0.05, 0.3, 0.02), drip(-0.03, 0.2, 0.013)));
  const vomit = smoothstep(0.0, 0.005, shape).mul(front);
  const cell = floor(p.mul(110));
  const chunk = smoothstep(0.93, 0.96, hash(cell.x.add(cell.y.mul(57)).add(cell.z.mul(131))));
  const vomitC = mix(mix(color(0xb3a466), color(0x857843), n2.mul(0.5).add(0.5)), color(0xb87a3e), chunk.mul(0.6));
  const wetRim = smoothstep(-0.012, 0.0, shape).mul(float(1).sub(vomit)).mul(front);
  mat.colorNode = mix(cloth.mul(float(1).sub(wetRim.mul(0.3))), vomitC, vomit);
  mat.roughnessNode = mix(float(0.95), float(0.28), max(vomit, wetRim.mul(0.5)));
  return mat;
}

function stripedSockMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const stripe = smoothstep(0.45, 0.55, fract(positionGeometry.y.div(0.045)));
  const knit = mx_noise_float(positionGeometry.mul(200)).mul(0.05).add(1);
  mat.colorNode = mix(color(0xf1efe8), color(0xc4382c), stripe).mul(knit);
  return mat;
}

function boxerMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  const p = positionGeometry;
  const st = vec2(p.x.add(p.z), p.y).mul(28);
  const dot = smoothstep(0.22, 0.18, length(fract(st).sub(0.5)));
  mat.colorNode = mix(color(0x46679c), color(0xf2f0ea), dot.mul(0.8));
  return mat;
}

/** Peau texturée + barbe de trois jours et cernes (repère du modèle au repos). */
function skinMaterial(src: THREE.MeshStandardMaterial, ex: Extras): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const p = positionGeometry;
  const base = src.map ? texture(src.map, uv()) : color(0xe0b393);
  const faceFront = smoothstep(-0.02, 0.04, p.z.sub(ex.chestZ - 0.1));
  const jaw = smoothstep(ex.eyesY - 0.155, ex.eyesY - 0.13, p.y)
    .mul(float(1).sub(smoothstep(ex.eyesY - 0.075, ex.eyesY - 0.055, p.y)))
    .mul(float(1).sub(smoothstep(0.02, 0.028, abs(p.x)).mul(smoothstep(ex.eyesY - 0.07, ex.eyesY - 0.09, p.y)).oneMinus().mul(0)));
  const stubbleGrain = smoothstep(0.35, 0.75, mx_noise_float(p.mul(900)).mul(0.5).add(0.5));
  const stubble = jaw.mul(faceFront).mul(stubbleGrain.mul(0.5).add(0.5)).mul(0.45);
  const bags = float(1)
    .sub(smoothstep(0.0, 0.012, abs(p.y.sub(ex.eyesY - 0.018))))
    .mul(float(1).sub(smoothstep(0.02, 0.05, abs(abs(p.x).sub(0.032)))))
    .mul(faceFront)
    .mul(0.3);
  const c = base.rgb.mul(float(1).sub(stubble)).mul(mix(vec3(1), vec3(0.8, 0.68, 0.72), bags));
  // Cheveux ras sous la capuche : ligne d'implantation au-dessus du front
  const hairline = float(ex.eyesY + 0.065).add(p.x.mul(p.x).mul(3.5));
  const hair = smoothstep(hairline, hairline.add(0.012), p.y).mul(mx_noise_float(p.mul(260)).mul(0.25).add(0.85));
  const skinC = mix(c, c.mul(vec3(0.62, 0.58, 0.56)), stubble);
  mat.colorNode = mix(skinC, vec3(0.2, 0.14, 0.1), hair.clamp(0, 1));
  return mat;
}

function tulleMaterial(tint: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, side: THREE.DoubleSide });
  const p = positionGeometry;
  const mesh = smoothstep(0.35, 0.5, abs(fract(p.x.mul(220)).sub(0.5)).add(abs(fract(p.z.mul(220)).sub(0.5)))).mul(0.06);
  mat.colorNode = color(tint).mul(float(1).sub(mesh)).mul(mx_noise_float(p.mul(18)).mul(0.07).add(1));
  return mat;
}

/** Une couche de tulle froncée, bord ondulé, légèrement tombante. */
function tutuLayer(rIn: number, rOut: number, drop: number, ruffles: number, phase: number, y: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(rIn, rOut, 96, 5);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const t = THREE.MathUtils.clamp((r - rIn) / (rOut - rIn), 0, 1);
    const wave = Math.sin(a * ruffles + phase) * 0.02 * t + Math.sin(a * ruffles * 2.3 + phase * 2) * 0.007 * t;
    const k = 1 + Math.sin(a * 5 + phase) * 0.04 * t;
    pos.setXYZ(i, x * k, y - drop * Math.pow(t, 1.4) + wave, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function buildTutu(): THREE.Group {
  const tutu = new THREE.Group();
  tutu.scale.set(1, 1, 0.82);
  const layers: Array<[number, number, number, number, number, number, number]> = [
    [0.15, 0.31, 0.09, 12, 0.0, -0.02, 0xf2a7c8],
    [0.15, 0.28, 0.07, 14, 1.7, 0.0, 0xf6b9d3],
    [0.15, 0.25, 0.05, 10, 3.1, 0.02, 0xfacbe0],
  ];
  for (const [ri, ro, dr, ru, ph, y, tint] of layers) {
    const m = new THREE.Mesh(tutuLayer(ri, ro, dr, ru, ph, y), tulleMaterial(tint));
    m.castShadow = m.receiveShadow = true;
    tutu.add(m);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.016, 8, 40), new THREE.MeshStandardNodeMaterial({ color: 0xe98fb7, roughness: 0.3 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.035;
  band.castShadow = true;
  tutu.add(band);
  return tutu;
}

// ---------------------------------------------------------------- modèle animé

export class Hero {
  readonly root = new THREE.Group();
  readonly glassesAnchor: THREE.Object3D;
  private readonly b: Record<string, THREE.Bone> = {};
  /** Directions de repos (espace du modèle) du bras et de l'avant-bras. */
  private readonly rest: { upperL: THREE.Vector3; upperR: THREE.Vector3; foreL: THREE.Vector3; foreR: THREE.Vector3 };
  private readonly model: THREE.Object3D;
  private readonly rootY: number;

  constructor(scene: THREE.Group, readonly extras: Extras) {
    this.root.add(scene);
    scene.traverse((o) => {
      const bone = o as THREE.Bone;
      if (bone.isBone) this.b[bone.name] = bone;
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      switch (src.name) {
        case 'hoodie':
          mesh.material = hoodieMaterial(extras);
          break;
        case 'sock_striped':
          mesh.material = stripedSockMaterial();
          break;
        case 'boxer':
          mesh.material = boxerMaterial();
          break;
        case 'skin':
          mesh.material = skinMaterial(src, extras);
          break;
        case 'eyebrows':
        case 'eyelashes':
          mesh.castShadow = false;
          break;
      }
    });
    this.glassesAnchor = scene.getObjectByName('anchor_glasses') ?? this.b['head'];
    const tutuAnchor = scene.getObjectByName('anchor_tutu');
    if (tutuAnchor) tutuAnchor.add(buildTutu());

    // Éclaboussure de vomi sur la basket (pied gauche)
    const foot = this.b['foot_L'];
    if (foot) {
      const splash = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 8),
        new THREE.MeshStandardNodeMaterial({ color: 0xa8994f, roughness: 0.3 }),
      );
      splash.scale.set(1.3, 0.35, 1);
      splash.position.set(0.0, -0.035, 0.12);
      foot.add(splash);
    }

    // Directions de repos des bras (pose en A, bras vers l'avant) pour les réorienter
    this.model = scene;
    scene.updateMatrixWorld(true);
    const at = (n: string) => new THREE.Vector3().setFromMatrixPosition(this.b[n].matrixWorld);
    const dir = (a: string, c: string) => at(c).sub(at(a)).normalize();
    this.rest = {
      upperL: dir('upperarm01_L', 'lowerarm01_L'),
      upperR: dir('upperarm01_R', 'lowerarm01_R'),
      foreL: dir('lowerarm01_L', 'wrist_L'),
      foreR: dir('lowerarm01_R', 'wrist_R'),
    };
    this.rootY = this.b['root']?.position.y ?? 0;
  }

  private rot(name: string, x: number, y: number, z: number): void {
    const bone = this.b[name];
    if (bone) bone.rotation.set(x, y, z);
  }

  setPose(p: HeroPose): void {
    // Jambes : cuisse, genou, cheville (le pied reste à peu près à plat)
    this.rot('upperleg01_L', p.thighL, 0, 0);
    this.rot('upperleg01_R', p.thighR, 0, 0);
    this.rot('lowerleg01_L', p.kneeL, 0, 0);
    this.rot('lowerleg01_R', p.kneeR, 0, 0);
    this.rot('foot_L', p.footL, 0, 0);
    this.rot('foot_R', p.footR, 0, 0);
    // Colonne : penchée, roulis, torsion répartis sur trois vertèbres
    for (const s of ['spine04', 'spine03', 'spine02']) this.rot(s, p.lean / 3, p.twist / 3, p.roll / 3);
    this.rot('neck01', p.headNod * 0.4, 0, p.headRoll * 0.4);
    this.rot('head', p.headNod * 0.6, 0, p.headRoll * 0.6);
    const root = this.b['root'];
    if (root) root.position.y = this.rootY + p.bob;
    // Bras : orientés vers une direction cible (pendants, légèrement écartés, balancés)
    this.model.updateMatrixWorld(true);
    this.aimArm('L', 1, p.armL, p.elbowL, p.armOut);
    this.aimArm('R', -1, p.armR, p.elbowR, p.armOut);
  }

  private readonly tq = new THREE.Quaternion();
  private readonly tq2 = new THREE.Quaternion();
  private readonly tv = new THREE.Vector3();
  private readonly tv2 = new THREE.Vector3();
  private readonly mq = new THREE.Quaternion();
  private readonly X = new THREE.Vector3(1, 0, 0);

  private aimArm(side: 'L' | 'R', sign: number, swing: number, elbow: number, out: number): void {
    const upper = this.b[`upperarm01_${side}`];
    const fore = this.b[`lowerarm01_${side}`];
    if (!upper || !fore || !upper.parent) return;
    // Rotation monde du parent, ramenée dans l'espace du modèle
    this.model.getWorldQuaternion(this.mq).invert();
    const parentQ = upper.parent.getWorldQuaternion(this.tq2).premultiply(this.mq);
    // Bras : vers le bas, un peu écarté, balancé autour de l'axe latéral
    const d = this.tv.set(sign * Math.sin(out), -Math.cos(out), 0).applyAxisAngle(this.X, swing);
    const worldUpper = new THREE.Quaternion().setFromUnitVectors(side === 'L' ? this.rest.upperL : this.rest.upperR, d);
    upper.quaternion.copy(parentQ.clone().invert().multiply(worldUpper));
    // Avant-bras : plié autour de l'axe du coude (perpendiculaire au bras, horizontal)
    const hinge = this.tv2.copy(this.X).addScaledVector(d, -this.X.dot(d)).normalize();
    const f = d.clone().applyAxisAngle(hinge, elbow);
    const worldFore = this.tq.setFromUnitVectors(side === 'L' ? this.rest.foreL : this.rest.foreR, f);
    // Le parent de l'avant-bras (upperarm02) est sans rotation propre : même orientation que le bras
    fore.quaternion.copy(worldUpper.clone().invert().multiply(worldFore));
  }
}

/** Crée une copie du héros (squelette compris). Le modèle doit avoir été préchargé. */
export function createHero(): Hero {
  if (!loaded) throw new Error('hero.glb non préchargé (preloadHero)');
  const copy = cloneSkinned(loaded.scene as unknown as THREE.Object3D) as unknown as THREE.Group;
  const hero = new Hero(copy, loaded.extras);
  hero.setPose(REST_POSE);
  return hero;
}

export async function loadHero(): Promise<Hero> {
  await preloadHero();
  return createHero();
}
