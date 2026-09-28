import * as THREE from 'three/webgpu';
import { part, merge, KEEP_COLORS } from './Batch';

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Profil de révolution [rayon, hauteur] autour de l'axe y. */
function lathe(points: Array<[number, number]>, segments = 10): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    segments,
  );
}

/** Hash déterministe d'une position (même sommet => même valeur, pas de fissure). */
function vhash(x: number, y: number, z: number, salt = 0): number {
  const s = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 97) * 78.233 + Math.round(z * 97) * 37.719 + salt) * 43758.5453;
  return s - Math.floor(s);
}

/** Déforme les sommets (bosselage organique) et colore selon la hauteur + bruit. */
function organic(
  g: THREE.BufferGeometry,
  jitter: number,
  colorAt: (x: number, y: number, z: number, n: number) => THREE.Color,
): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = vhash(x, y, z);
    const k = 1 + (h - 0.5) * 2 * jitter;
    pos.setXYZ(i, x * k, y * k, z * k);
    const c = colorAt(x, y, z, vhash(x, y, z, 7));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function transformed(g: THREE.BufferGeometry, pos: [number, number, number], scale = 1): THREE.BufferGeometry {
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale)));
}

// ---------------------------------------------------------------- Mobilier

const IRON = 0x21352c;
const PAINT_GREEN = 0x3d6a52;

/** Banc Davioud : piètement en fonte, lattes peintes en vert. Assise vers +z. */
export function benchGeometry(slat = PAINT_GREEN, frame = IRON): THREE.BufferGeometry {
  const side = new THREE.Shape();
  // Profil latéral (z, y) du piètement : pied avant, assise, dossier incliné
  side.moveTo(0.22, 0);
  side.lineTo(0.28, 0);
  side.quadraticCurveTo(0.26, 0.3, 0.26, 0.44);
  side.lineTo(-0.2, 0.44);
  side.quadraticCurveTo(-0.26, 0.7, -0.33, 0.9);
  side.lineTo(-0.27, 0.9);
  side.quadraticCurveTo(-0.21, 0.66, -0.16, 0.5);
  side.lineTo(-0.16, 0.38);
  side.quadraticCurveTo(-0.2, 0.2, -0.26, 0);
  side.lineTo(-0.2, 0);
  side.quadraticCurveTo(-0.12, 0.22, -0.08, 0.38);
  side.lineTo(0.18, 0.38);
  side.quadraticCurveTo(0.2, 0.2, 0.22, 0);
  const legGeo = new THREE.ExtrudeGeometry(side, { depth: 0.07, bevelEnabled: false, curveSegments: 1 });
  legGeo.rotateY(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.78, 0.78]) parts.push(part(legGeo, frame, [x + 0.035, 0, 0]));
  for (let i = 0; i < 4; i++) parts.push(part(box, slat, [0, 0.47, 0.22 - i * 0.115], [0, 0, 0], [1.8, 0.045, 0.09]));
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    parts.push(part(box, slat, [0, 0.58 + t * 0.26, -0.2 - t * 0.1], [-0.35, 0, 0], [1.8, 0.1, 0.035]));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- Végétation


/** Buis taillé en boule. */
export function bushGeometry(): THREE.BufferGeometry {
  return merge([
    transformed(
      organic(new THREE.IcosahedronGeometry(1, 1), 0.1, (_x, y, _z, n) =>
        new THREE.Color(0x3f6b36).lerp(new THREE.Color(0x7da855), THREE.MathUtils.clamp((y + 1) / 2, 0, 1) * 0.8 + n * 0.2),
      ),
      [0, 0.55, 0],
      0.62,
    ),
  ]);
}

// ---------------------------------------------------------------- Voitures

/** Carrosserie arrondie (profil extrudé), avant vers +z, sans les roues. */
export function carBodyParts(paint = 0xffffff): THREE.BufferGeometry[] {
  const glass = 0x26303f;
  const profile = new THREE.Shape();
  profile.moveTo(-2.0, 0.3);
  profile.lineTo(1.95, 0.3);
  profile.quadraticCurveTo(2.08, 0.32, 2.07, 0.55);
  profile.quadraticCurveTo(2.05, 0.78, 1.85, 0.8);
  profile.lineTo(0.95, 0.88);
  profile.quadraticCurveTo(0.8, 0.9, 0.72, 0.95);
  profile.quadraticCurveTo(0.35, 1.32, 0.05, 1.42);
  profile.lineTo(-0.95, 1.44);
  profile.quadraticCurveTo(-1.2, 1.43, -1.35, 1.25);
  profile.lineTo(-1.62, 0.96);
  profile.quadraticCurveTo(-1.95, 0.92, -2.05, 0.85);
  profile.quadraticCurveTo(-2.1, 0.6, -2.0, 0.3);
  const width = 1.72;
  const body = new THREE.ExtrudeGeometry(profile, {
    depth: width - 0.16,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 1,
    curveSegments: 3,
  });
  body.translate(0, 0, -(width - 0.16) / 2);
  body.rotateY(-Math.PI / 2);

  const win = new THREE.Shape();
  win.moveTo(0.68, 0.98);
  win.quadraticCurveTo(0.34, 1.3, 0.05, 1.38);
  win.lineTo(-0.93, 1.39);
  win.quadraticCurveTo(-1.15, 1.38, -1.28, 1.24);
  win.lineTo(-1.52, 0.99);
  win.closePath();
  const windows = new THREE.ExtrudeGeometry(win, { depth: width + 0.02, bevelEnabled: false, curveSegments: 3 });
  windows.translate(0, 0, -(width + 0.02) / 2);
  windows.rotateY(-Math.PI / 2);

  const lamp = cyl(0.11, 0.11, 0.05, 6);
  return [
    part(body, paint),
    part(windows, glass),
    part(box, 0x2a2c30, [0, 0.36, 0], [0, 0, 0], [1.6, 0.14, 4.05]),
    part(box, 0xc9ccd2, [0, 0.42, 2.1], [0, 0, 0], [1.6, 0.1, 0.08]),
    part(box, 0xc9ccd2, [0, 0.42, -2.1], [0, 0, 0], [1.6, 0.1, 0.08]),
    part(lamp, 0xfff2c4, [0.58, 0.64, 2.08], [Math.PI / 2, 0, 0]),
    part(lamp, 0xfff2c4, [-0.58, 0.64, 2.08], [Math.PI / 2, 0, 0]),
    part(box, 0xc8363c, [0.66, 0.7, -2.1], [0, 0, 0], [0.26, 0.12, 0.04]),
    part(box, 0xc8363c, [-0.66, 0.7, -2.1], [0, 0, 0], [0.26, 0.12, 0.04]),
    part(box, 0xf2f0e8, [0, 0.5, -2.13], [0, 0, 0], [0.5, 0.12, 0.02]),
  ];
}

export function wheelGeometry(): THREE.BufferGeometry {
  return merge([
    part(cyl(0.34, 0.34, 0.24, 9), 0x1d1e22, [0, 0, 0], [0, 0, Math.PI / 2]),
    // Enjoliveur : simple disque de chaque côté
    part(new THREE.CircleGeometry(0.2, 7), 0xd8dade, [0.125, 0, 0], [0, Math.PI / 2, 0]),
    part(new THREE.CircleGeometry(0.2, 7), 0xd8dade, [-0.125, 0, 0], [0, -Math.PI / 2, 0]),
  ]);
}

export const WHEEL_POS: Array<[number, number]> = [
  [0.8, 1.3],
  [-0.8, 1.3],
  [0.8, -1.3],
  [-0.8, -1.3],
];

/** Voiture de décor complète (roues comprises). */
export function carGeometry(paint = 0xffffff): THREE.BufferGeometry {
  const w = wheelGeometry();
  return merge([...carBodyParts(paint), ...WHEEL_POS.map(([x, z]) => part(w, KEEP_COLORS, [x, 0.34, z]))]);
}

// ---------------------------------------------------------------- Banlieue résidentielle

/** Poteau électrique en bois : traverse le long de la rue (x), rue vers +z. */
export function poleGeometry(light: boolean, transformer: boolean): THREE.BufferGeometry {
  const wood = 0x6e5d4b;
  const parts = [
    part(cyl(0.11, 0.15, 9, 7), wood, [0, 4.5, 0]),
    part(box, 0x5e4f40, [0, 8.4, 0], [0, 0, 0], [2.4, 0.13, 0.13]),
    part(box, 0x5e4f40, [0, 7.9, 0], [0, 0, 0.9], [0.06, 0.9, 0.06]),
  ];
  for (const x of [-1.05, 0, 1.05]) parts.push(part(cyl(0.05, 0.06, 0.18, 6), 0x9fb7a8, [x, 8.56, 0]));
  if (transformer) {
    parts.push(part(cyl(0.3, 0.3, 0.9, 10), 0x8b9096, [0, 7.0, -0.35]));
    parts.push(part(cyl(0.32, 0.32, 0.06, 10), 0x6d7278, [0, 7.48, -0.35]));
  }
  if (light) {
    // Lampadaire « cobra » : bras vers la chaussée
    parts.push(part(cyl(0.035, 0.035, 2.2, 5), 0x8a8f96, [0, 7.3, 1.05], [Math.PI / 2 - 0.12, 0, 0]));
    parts.push(part(box, 0x8a8f96, [0, 7.42, 2.2], [0.1, 0, 0], [0.34, 0.14, 0.7]));
    parts.push(part(box, 0xfff4d6, [0, 7.34, 2.24], [0.1, 0, 0], [0.26, 0.03, 0.5]));
  }
  return merge(parts);
}

/** Bouche d'incendie américaine. */
export function hydrantGeometry(): THREE.BufferGeometry {
  const red = 0xc4382c;
  return merge([
    part(cyl(0.2, 0.22, 0.08, 10), 0x8c8f93, [0, 0.04, 0]),
    part(cyl(0.14, 0.15, 0.55, 10), red, [0, 0.35, 0]),
    part(cyl(0.18, 0.16, 0.08, 10), red, [0, 0.62, 0]),
    part(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0b32e, [0, 0.66, 0]),
    part(cyl(0.05, 0.05, 0.1, 8), 0xe0b32e, [0, 0.82, 0]),
    part(cyl(0.06, 0.06, 0.42, 8), red, [0, 0.45, 0], [0, 0, Math.PI / 2]),
    part(cyl(0.08, 0.08, 0.12, 8), red, [0, 0.45, 0.14], [Math.PI / 2, 0, 0]),
  ]);
}

/** Boîte aux lettres sur poteau, drapeau rouge. Ouverture vers +z (la rue). */
export function mailboxGeometry(): THREE.BufferGeometry {
  return merge([
    part(box, 0x6a553f, [0, 0.55, 0], [0, 0, 0], [0.1, 1.1, 0.1]),
    part(box, 0x2b2e33, [0, 1.15, 0.05], [0, 0, 0], [0.26, 0.22, 0.5]),
    part(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10, 1, false, 0, Math.PI), 0x2b2e33, [0, 1.26, 0.05], [Math.PI / 2, 0, Math.PI / 2]),
    part(box, 0xc4382c, [0.15, 1.3, -0.05], [0, 0, 0], [0.02, 0.2, 0.08]),
  ]);
}

/** Poubelle à roulettes (conteneur). Couvercle vers le haut, poignée côté -z. */
export function wheelieBinGeometry(): THREE.BufferGeometry {
  return merge([
    part(box, 0xffffff, [0, 0.5, 0], [0, 0, 0], [0.58, 0.95, 0.68]),
    part(box, 0xffffff, [0, 1.0, 0.02], [0, 0, 0], [0.62, 0.06, 0.74]),
    part(box, 0x222428, [0, 0.95, -0.36], [0, 0, 0], [0.5, 0.05, 0.06]),
    part(cyl(0.1, 0.1, 0.06, 8), 0x222428, [0.26, 0.1, -0.3], [0, 0, Math.PI / 2]),
    part(cyl(0.1, 0.1, 0.06, 8), 0x222428, [-0.26, 0.1, -0.3], [0, 0, Math.PI / 2]),
  ]);
}

/** Tronc et branches d'un feuillu (le houppier est fait de cartes de feuilles). */
export function leafyTrunkGeometry(): THREE.BufferGeometry {
  const barkCols = [new THREE.Color(0x5b4b3d), new THREE.Color(0x6e5d4c), new THREE.Color(0x4d4035)];
  const trunk = organic(
    lathe(
      [
        [0.3, 0],
        [0.22, 0.4],
        [0.19, 1.6],
        [0.16, 2.6],
        [0.1, 3.6],
      ],
      8,
    ),
    0.06,
    (_x, _y, _z, n) => barkCols[Math.floor(n * barkCols.length)].clone(),
  );
  const branch = (len: number, rx: number, rz: number, y: number) => {
    const g = cyl(0.04, 0.09, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(0, y, 0);
    return part(g, 0x5b4b3d);
  };
  return merge([trunk, branch(1.8, 0.6, 0.5, 2.2), branch(1.7, -0.5, -0.6, 2.4), branch(1.5, 0.4, -0.7, 2.9), branch(1.5, -0.6, 0.5, 3.1)]);
}

/**
 * Houppier en cartes de feuilles croisées : normales sphériques (éclairage doux), couleurs plus
 * sombres en bas (occlusion factice). À utiliser avec leafMaterial().
 */
export function leafCrownGeometry(seed = 1, cards = 44, radius = [2.4, 2.0, 2.4], center = [0, 4.5, 0]): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const uvs: number[] = [];
  const dark = new THREE.Color(0x4a6c35);
  const light = new THREE.Color(0x86ad52);
  const c = new THREE.Vector3(...center);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    // Point dans l'ellipsoïde, plutôt vers la surface
    const u = rnd() * Math.PI * 2;
    const w = Math.acos(2 * rnd() - 1);
    const r = 0.55 + 0.45 * Math.cbrt(rnd());
    const p = new THREE.Vector3(Math.sin(w) * Math.cos(u) * radius[0] * r, Math.cos(w) * radius[1] * r, Math.sin(w) * Math.sin(u) * radius[2] * r).add(c);
    const size = 2.0 + rnd() * 1.0;
    const t = THREE.MathUtils.clamp((p.y - c.y) / radius[1] * 0.5 + 0.5, 0, 1);
    const cc = dark.clone().lerp(light, t * 0.8 + rnd() * 0.2);
    for (const extra of [0, Math.PI / 2]) {
      q.setFromEuler(e.set((rnd() - 0.5) * 1.2, rnd() * Math.PI + extra, (rnd() - 0.5) * 0.8));
      const corners = [
        [-0.5, -0.5, 0, 0],
        [0.5, -0.5, 1, 0],
        [0.5, 0.5, 1, 1],
        [-0.5, 0.5, 0, 1],
      ];
      const idx = [0, 1, 2, 0, 2, 3];
      for (const k of idx) {
        const [cx, cy, uu, vv] = corners[k];
        v.set(cx * size, cy * size, 0).applyQuaternion(q).add(p);
        pos.push(v.x, v.y, v.z);
        const n = v.clone().sub(c).normalize();
        nor.push(n.x, n.y * 0.8 + 0.2, n.z);
        col.push(cc.r, cc.g, cc.b);
        uvs.push(uu, vv);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingSphere();
  return g;
}
