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

// ---------------------------------------------------------------- Mobilier parisien

const IRON = 0x21352c;
const PAINT_GREEN = 0x3d6a52;

/** Banc Davioud : piètement en fonte, lattes peintes en vert. Assise vers +z. */
export function benchGeometry(): THREE.BufferGeometry {
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
  for (const x of [-0.78, 0.78]) parts.push(part(legGeo, IRON, [x + 0.035, 0, 0]));
  for (let i = 0; i < 4; i++) parts.push(part(box, PAINT_GREEN, [0, 0.47, 0.22 - i * 0.115], [0, 0, 0], [1.8, 0.045, 0.09]));
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    parts.push(part(box, PAINT_GREEN, [0, 0.58 + t * 0.26, -0.2 - t * 0.1], [-0.35, 0, 0], [1.8, 0.1, 0.035]));
  }
  return merge(parts);
}

/** Poubelle « Vigipirate » : cerceau vert sur poteau et sac translucide. */
export function binGeometry(): THREE.BufferGeometry {
  const bag = lathe(
    [
      [0.001, 0.25],
      [0.14, 0.27],
      [0.22, 0.42],
      [0.25, 0.7],
      [0.27, 0.92],
      [0.25, 0.95],
    ],
    12,
  );
  return merge([
    part(cyl(0.045, 0.05, 1.05, 8), IRON, [0, 0.52, -0.3]),
    part(box, IRON, [0, 0.93, -0.15], [0, 0, 0], [0.05, 0.05, 0.28]),
    part(new THREE.TorusGeometry(0.27, 0.025, 6, 20), PAINT_GREEN, [0, 0.95, 0], [Math.PI / 2, 0, 0]),
    part(new THREE.TorusGeometry(0.27, 0.02, 6, 20), PAINT_GREEN, [0, 0.8, 0], [Math.PI / 2, 0, 0]),
    part(bag, 0xa8bfa6),
  ]);
}

/** Candélabre parisien : pied mouluré, fût, lanterne vitrée. */
export function lampGeometry(): THREE.BufferGeometry {
  const post = lathe(
    [
      [0.2, 0],
      [0.15, 0.18],
      [0.13, 0.42],
      [0.1, 0.55],
      [0.075, 3.55],
      [0.1, 3.62],
      [0.08, 3.72],
      [0.07, 3.95],
      [0.12, 4.0],
    ],
    7,
  );
  const glass = lathe(
    [
      [0.12, 4.0],
      [0.25, 4.5],
      [0.27, 4.58],
    ],
    6,
  );
  const cap = lathe(
    [
      [0.33, 4.58],
      [0.31, 4.66],
      [0.14, 4.82],
      [0.05, 4.9],
      [0.07, 4.97],
      [0.001, 5.05],
    ],
    6,
  );
  const ring = cyl(0.13, 0.13, 0.08, 10);
  return merge([part(post, IRON), part(glass, 0xffe6a8), part(cap, IRON), part(ring, 0x9c8a4a, [0, 1.2, 0])]);
}

/** Potelet (borne anti-stationnement). */
export function bollardGeometry(): THREE.BufferGeometry {
  return merge([
    part(
      lathe(
        [
          [0.06, 0],
          [0.055, 0.78],
          [0.07, 0.8],
          [0.07, 0.86],
          [0.055, 0.9],
          [0.001, 0.97],
        ],
        6,
      ),
      0x2a3a31,
    ),
    part(cyl(0.062, 0.062, 0.05, 6), 0xb9a25a, [0, 0.7, 0]),
  ]);
}

/** Colonne Morris (corps sans les affiches). */
export function morrisGeometry(): THREE.BufferGeometry {
  const body = lathe(
    [
      [0.78, 0],
      [0.78, 0.3],
      [0.7, 0.36],
      [0.68, 0.4],
      [0.68, 2.55],
      [0.8, 2.62],
      [0.82, 2.75],
      [0.72, 2.82],
      [0.72, 3.05],
      [0.62, 3.3],
      [0.38, 3.55],
      [0.14, 3.72],
      [0.06, 3.9],
      [0.001, 4.0],
    ],
    16,
  );
  return merge([part(body, 0x2f5a47)]);
}

/** Fontaine Wallace simplifiée : piédestal, quatre cariatides, dôme. */
export function wallaceGeometry(): THREE.BufferGeometry {
  const green = 0x26503f;
  const parts = [
    part(
      lathe(
        [
          [0.45, 0],
          [0.45, 0.22],
          [0.36, 0.3],
          [0.3, 0.85],
          [0.38, 0.95],
          [0.36, 1.02],
        ],
        8,
      ),
      green,
    ),
    part(
      lathe(
        [
          [0.44, 1.95],
          [0.44, 2.05],
          [0.3, 2.25],
          [0.12, 2.42],
          [0.05, 2.6],
          [0.001, 2.66],
        ],
        8,
      ),
      green,
    ),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.24;
    const z = Math.sin(a) * 0.24;
    parts.push(part(cyl(0.06, 0.09, 0.75, 6), green, [x, 1.4, z]));
    parts.push(part(new THREE.IcosahedronGeometry(0.075, 0), green, [x, 1.84, z]));
  }
  return merge(parts);
}

/** Grille d'arbre en fonte au pied des platanes. */
export function treeGrateGeometry(): THREE.BufferGeometry {
  return merge([
    part(box, 0x2b2d2f, [0, 0.008, 0], [0, 0, 0], [1.5, 0.016, 1.5]),
    part(new THREE.TorusGeometry(0.42, 0.03, 4, 16), 0x3a3c3f, [0, 0.018, 0], [Math.PI / 2, 0, 0]),
  ]);
}

// ---------------------------------------------------------------- Végétation

const bark = [new THREE.Color(0xc9bf9c), new THREE.Color(0x9a9676), new THREE.Color(0xe0d8bd), new THREE.Color(0x8a8c6c)];
const leafDark = new THREE.Color(0x4a7a3c);
const leafLight = new THREE.Color(0xa6cc6c);
const leafWarm = new THREE.Color(0xc7c96a);

/** Platane : tronc à l'écorce marbrée, houppier en bouquets bosselés. */
export function treeGeometry(): THREE.BufferGeometry {
  const trunk = organic(
    lathe(
      [
        [0.28, 0],
        [0.21, 0.35],
        [0.18, 1.2],
        [0.16, 2.2],
        [0.12, 2.9],
      ],
      8,
    ),
    0.05,
    (_x, _y, _z, n) => bark[Math.floor(n * bark.length)].clone(),
  );
  const branch = (len: number, rx: number, rz: number, y: number) => {
    const g = cyl(0.05, 0.1, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(0, y, 0);
    return part(g, 0xa9a283);
  };
  const blobs: Array<[number, number, number, number]> = [
    [0, 4.1, 0, 1.45],
    [0.9, 3.6, 0.3, 1.05],
    [-0.8, 3.7, -0.4, 1.1],
    [0.2, 3.4, -0.95, 0.95],
    [-0.3, 3.35, 0.95, 0.95],
    [0.35, 4.8, 0.2, 0.95],
  ];
  const crown = blobs.map(([x, y, z, r]) =>
    transformed(
      organic(new THREE.IcosahedronGeometry(1, 1), 0.16, (_vx, vy, _vz, n) => {
        const t = THREE.MathUtils.clamp((vy + 1) / 2, 0, 1);
        const c = leafDark.clone().lerp(leafLight, t * 0.85 + n * 0.15);
        return n > 0.85 ? c.lerp(leafWarm, 0.4) : c;
      }),
      [x, y, z],
      r,
    ),
  );
  return merge([trunk, branch(1.3, 0.5, 0.4, 2.3), branch(1.2, -0.45, -0.5, 2.4), branch(1.1, 0.3, -0.6, 2.6), ...crown]);
}

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
