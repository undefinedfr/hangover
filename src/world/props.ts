import * as THREE from 'three/webgpu';
import { part, merge } from './Batch';

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Banc public : assise 1,6 m, dossier côté -z. Origine au sol. */
export function benchGeometry(): THREE.BufferGeometry {
  const wood = 0xc8874f;
  const metal = 0x3d4a5c;
  return merge([
    part(box, wood, [0, 0.46, 0.02], [0, 0, 0], [1.7, 0.07, 0.5]),
    part(box, wood, [0, 0.78, -0.22], [-0.15, 0, 0], [1.7, 0.32, 0.06]),
    part(box, metal, [-0.7, 0.23, 0], [0, 0, 0], [0.07, 0.46, 0.45]),
    part(box, metal, [0.7, 0.23, 0], [0, 0, 0], [0.07, 0.46, 0.45]),
    part(box, metal, [-0.7, 0.62, -0.23], [0, 0, 0], [0.06, 0.36, 0.06]),
    part(box, metal, [0.7, 0.62, -0.23], [0, 0, 0], [0.06, 0.36, 0.06]),
  ]);
}

/** Poubelle cylindrique ouverte (on peut y cacher des choses…). */
export function binGeometry(): THREE.BufferGeometry {
  const body = cyl(0.36, 0.3, 0.9, 10);
  body.translate(0, 0.45, 0);
  const rim = new THREE.TorusGeometry(0.36, 0.04, 4, 12);
  return merge([
    part(body, 0x3fa37a),
    part(rim, 0x2c7a5a, [0, 0.9, 0], [Math.PI / 2, 0, 0]),
    part(box, 0x2c7a5a, [0, 0.55, 0.33], [0, 0, 0], [0.3, 0.12, 0.06]),
  ]);
}

export function lampGeometry(): THREE.BufferGeometry {
  const pole = cyl(0.06, 0.09, 4.6, 6);
  return merge([
    part(cyl(0.18, 0.22, 0.3, 8), 0x3a3f58, [0, 0.15, 0]),
    part(pole, 0x3a3f58, [0, 2.4, 0]),
    part(box, 0x3a3f58, [0, 4.65, 0.45], [0, 0, 0], [0.08, 0.08, 0.95]),
    part(box, 0xfff0c2, [0, 4.55, 0.85], [0, 0, 0], [0.3, 0.14, 0.4]),
  ]);
}

export function treeGeometry(): THREE.BufferGeometry {
  const crown = new THREE.IcosahedronGeometry(1.5, 0);
  const crown2 = new THREE.IcosahedronGeometry(1.1, 0);
  return merge([
    part(cyl(0.14, 0.2, 2.4, 6), 0x8a5a3b, [0, 1.2, 0]),
    part(crown, 0x7cc46a, [0, 3.2, 0]),
    part(crown2, 0x95d47a, [0.5, 4.0, 0.2], [0.4, 0.3, 0]),
  ]);
}

export function bushGeometry(): THREE.BufferGeometry {
  return merge([part(new THREE.IcosahedronGeometry(0.8, 0), 0x6bb35c, [0, 0.5, 0], [0, 0, 0], [1.4, 0.8, 1])]);
}

/** Voiture générique (décor ou joueur) : avant vers +z. Origine au sol. */
export function carGeometry(paint = 0xffffff): THREE.BufferGeometry {
  const glass = 0x2b3550;
  const tire = 0x1e1e26;
  const wheel = cyl(0.36, 0.36, 0.26, 10);
  const parts = [
    part(box, paint, [0, 0.62, 0], [0, 0, 0], [1.8, 0.62, 4.0]),
    part(box, paint, [0, 1.16, -0.25], [0, 0, 0], [1.6, 0.5, 2.1]),
    part(box, glass, [0, 1.17, 0.83], [-0.5, 0, 0], [1.5, 0.42, 0.06]),
    part(box, glass, [0, 1.17, -1.32], [0.45, 0, 0], [1.5, 0.42, 0.06]),
    part(box, glass, [0.81, 1.17, -0.25], [0, 0, 0], [0.03, 0.36, 1.8]),
    part(box, glass, [-0.81, 1.17, -0.25], [0, 0, 0], [0.03, 0.36, 1.8]),
    part(box, 0xfff2b8, [0.6, 0.7, 2.01], [0, 0, 0], [0.35, 0.16, 0.04]),
    part(box, 0xfff2b8, [-0.6, 0.7, 2.01], [0, 0, 0], [0.35, 0.16, 0.04]),
    part(box, 0xd9434c, [0.62, 0.72, -2.01], [0, 0, 0], [0.3, 0.14, 0.04]),
    part(box, 0xd9434c, [-0.62, 0.72, -2.01], [0, 0, 0], [0.3, 0.14, 0.04]),
  ];
  for (const [x, z] of [
    [0.85, 1.3],
    [-0.85, 1.3],
    [0.85, -1.3],
    [-0.85, -1.3],
  ]) {
    parts.push(part(wheel, tire, [x, 0.36, z], [0, 0, Math.PI / 2]));
  }
  return merge(parts);
}

/** Bouche d'incendie, pour égayer les trottoirs. */
export function hydrantGeometry(): THREE.BufferGeometry {
  return merge([
    part(cyl(0.16, 0.18, 0.6, 8), 0xe8504a, [0, 0.3, 0]),
    part(new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8504a, [0, 0.6, 0]),
    part(cyl(0.07, 0.07, 0.46, 6), 0xc23c38, [0, 0.4, 0], [0, 0, Math.PI / 2]),
  ]);
}

/** Toit à deux pans (prisme triangulaire), long selon x, pointe vers le haut. */
export function gableGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  // Normalise à une boîte unitaire posée sur y=0
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(0, -bb.min.y, 0);
  const size = new THREE.Vector3();
  bb.getSize(size);
  g.scale(1 / size.x, 1 / size.y, 1 / size.z);
  return g;
}
