import * as THREE from 'three/webgpu';
import { abs, atan, color, float, fract, length, max, mix, mx_noise_float, positionGeometry, smoothstep, vec2, vec3 } from 'three/tsl';

/**
 * Lunettes du héros, à l'échelle réelle (mètres, écart des verres 6,4 cm), abîmées par la soirée :
 * verre droit fêlé en étoile, pont réparé au ruban adhésif, branche gauche tordue, monture de travers.
 * Origine : milieu du pont, face avant vers +z.
 */

const LENS_W = 0.05;
const LENS_H = 0.037;
const EYE_X = 0.032;
const TEMPLE_L = 0.135;

function roundedRect(w: number, h: number, r: number, bottomRound = 0.012): THREE.Shape {
  // Forme « pantos » : haut presque droit, bas arrondi
  const s = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -h / 2;
  const rb = Math.max(r, bottomRound);
  s.moveTo(x0 + rb, y0);
  s.lineTo(x0 + w - rb, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rb);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + rb);
  s.quadraticCurveTo(x0, y0, x0 + rb, y0);
  return s;
}

let mats: { frame: THREE.Material; tape: THREE.Material; lens: THREE.Material; cracked: THREE.Material; metal: THREE.Material } | null = null;

function materials() {
  if (mats) return mats;
  const frame = new THREE.MeshStandardNodeMaterial({ roughness: 0.28, metalness: 0 });
  // Acétate écaille sombre : marbrures brun/noir
  const p = positionGeometry;
  const tort = smoothstep(-0.1, 0.45, mx_noise_float(p.mul(vec3(160, 260, 160))));
  frame.colorNode = mix(color(0x0d0907), color(0x4a2a14), tort.mul(0.8));

  const tape = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const dirt = mx_noise_float(p.mul(900)).mul(0.08).add(1);
  tape.colorNode = color(0xe9e4d6).mul(dirt);

  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x9a9ca0, roughness: 0.3, metalness: 1 });

  const lens = new THREE.MeshStandardNodeMaterial({
    color: 0xcfe6ee,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Verre fêlé : impact près du bord intérieur, rayons irréguliers et deux arcs concentriques
  const cracked = new THREE.MeshStandardNodeMaterial({
    roughness: 0.1,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const q = vec2(p.x, p.y).sub(vec2(-0.009, 0.006));
  const r = length(q);
  const a = atan(q.y, q.x);
  // Petites cassures anguleuses le long de chaque rayon, sans ondulation
  const wob = mx_noise_float(vec3(r.mul(900), 3.1, 0)).mul(0.06).add(mx_noise_float(vec3(q.mul(90), 1.7)).mul(0.1));
  const k = a.mul(11 / (2 * Math.PI)).add(wob);
  const width = float(0.00035).div(r.add(0.0015)).mul(11 / (2 * Math.PI));
  const rays = float(1).sub(smoothstep(width.mul(0.3), width, abs(fract(k).sub(0.5)).mul(-1).add(0.5)));
  // Certains rayons s'arrêtent plus tôt que d'autres
  const reach = mx_noise_float(vec3(k.floor().mul(7.3), 0, 0)).mul(0.012).add(0.02);
  const raysCut = rays.mul(smoothstep(reach, reach.sub(0.004), r));
  const ring = (rad: number, seed: number) =>
    float(1)
      .sub(smoothstep(0.0001, 0.0005, abs(r.sub(rad).add(mx_noise_float(vec3(a.mul(2), seed, 0)).mul(0.0015)))))
      .mul(smoothstep(-0.05, 0.15, mx_noise_float(vec3(a.mul(1.6), seed + 4, 0))));
  const impact = smoothstep(0.0022, 0.0006, r);
  const crack = max(max(raysCut, ring(0.0045, 2.0)), max(ring(0.0105, 5.0).mul(0.8), impact)).clamp(0, 1);
  cracked.colorNode = mix(color(0xcfe6ee), color(0xffffff), crack);
  cracked.opacityNode = float(0.2).add(crack.mul(0.75));
  cracked.roughnessNode = mix(float(0.05), float(0.6), crack);

  mats = { frame, tape, lens, cracked, metal };
  return mats;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  return o;
}

export function buildBrokenGlasses(): THREE.Group {
  const m = materials();
  const root = new THREE.Group();
  root.name = 'lunettes';

  const rimShape = roundedRect(LENS_W + 0.0065, LENS_H + 0.0065, 0.006, 0.016);
  rimShape.holes.push(roundedRect(LENS_W, LENS_H, 0.004, 0.013) as unknown as THREE.Path);
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0007, bevelSegments: 2, curveSegments: 10 });
  rimGeo.translate(0, 0, -0.00225);
  const lensGeo = new THREE.ShapeGeometry(roundedRect(LENS_W + 0.001, LENS_H + 0.001, 0.0045, 0.0135), 12);

  // Face avant légèrement vrillée (choc) : chaque cercle a son angle
  const sides: Array<{ s: number; tilt: number; cracked: boolean }> = [
    { s: -1, tilt: 0.02, cracked: false },
    { s: 1, tilt: -0.045, cracked: true },
  ];
  for (const { s, tilt, cracked } of sides) {
    const eye = new THREE.Group();
    eye.position.set(s * EYE_X, 0, 0);
    eye.rotation.set(0, s * -0.06, tilt);
    eye.add(mesh(rimGeo, m.frame));
    const lens = mesh(lensGeo, cracked ? m.cracked : m.lens);
    lens.castShadow = false;
    lens.renderOrder = 2;
    eye.add(lens);
    root.add(eye);
  }

  // Pont, puis ruban adhésif enroulé dessus (réparation de fortune)
  const bridge = mesh(new THREE.BoxGeometry(0.016, 0.0045, 0.004), m.frame);
  bridge.position.set(0, 0.009, 0);
  root.add(bridge);
  const tape = mesh(new THREE.CylinderGeometry(0.0048, 0.0052, 0.011, 10, 1, true), m.tape);
  tape.rotation.set(0.25, 0, Math.PI / 2 + 0.12);
  tape.position.set(0.0005, 0.009, 0);
  tape.scale.set(1, 1, 0.75);
  root.add(tape);

  // Branches : charnière métallique, tige, courbure derrière l'oreille. La gauche est tordue vers le bas et l'extérieur.
  const stemGeo = new THREE.BoxGeometry(0.0035, 0.0045, TEMPLE_L);
  stemGeo.translate(0, 0, -TEMPLE_L / 2);
  const tipGeo = new THREE.BoxGeometry(0.003, 0.004, 0.035);
  tipGeo.translate(0, 0, -0.0175);
  const hingeGeo = new THREE.BoxGeometry(0.004, 0.006, 0.006);
  for (const s of [-1, 1]) {
    const bent = s === -1;
    const hinge = new THREE.Group();
    hinge.position.set(s * (EYE_X + LENS_W / 2 + 0.004), 0.006, -0.003);
    hinge.add(mesh(hingeGeo, m.metal));
    const temple = new THREE.Group();
    temple.rotation.set(bent ? 0.22 : 0.02, s * (bent ? 0.32 : 0.05), bent ? 0.1 : 0);
    temple.add(mesh(stemGeo, m.frame));
    const tip = new THREE.Group();
    tip.position.set(0, 0, -TEMPLE_L);
    tip.rotation.set(bent ? 0.9 : 0.55, bent ? s * -0.3 : 0, 0);
    tip.add(mesh(tipGeo, m.frame));
    temple.add(tip);
    hinge.add(temple);
    root.add(hinge);
  }

  // Monture globalement de travers
  root.rotation.z = -0.035;
  return root;
}
