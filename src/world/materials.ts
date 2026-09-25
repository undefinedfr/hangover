import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  hash,
  mix,
  normalWorld,
  positionWorld,
  select,
  sign,
  step,
  vec3,
  color,
} from 'three/tsl';

/** Façades : couleur par instance + fenêtres procédurales (TSL), sans texture. */
export function buildingMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const wp = positionWorld;
  const n = normalWorld;
  const sideways = abs(n.x).greaterThan(0.5);
  const horiz = select(sideways, wp.z, wp.x);
  const colW = 2.6;
  const rowH = 3.2;
  const u = fract(horiz.div(colW));
  const v = fract(wp.y.div(rowH));
  const wall = float(1).sub(step(0.5, abs(n.y)));
  const upper = step(rowH, wp.y);
  const winUpper = step(0.28, u).mul(step(u, 0.72)).mul(step(0.3, v)).mul(step(v, 0.82));
  // Rez-de-chaussée : grandes vitrines
  const shopU = fract(horiz.div(5.2));
  const winShop = step(0.12, shopU).mul(step(shopU, 0.88)).mul(step(0.25, wp.y)).mul(step(wp.y, 2.4));
  const win = mix(winShop, winUpper, upper).mul(wall);
  // Encadrement plus clair autour des fenêtres
  const frame = step(0.22, u).mul(step(u, 0.78)).mul(step(0.24, v)).mul(step(v, 0.88)).mul(upper).mul(wall);

  // Pas de coordonnée de profondeur dans le hash : sur une façade elle est constante et
  // tombe parfois pile sur un entier (floor instable => grésillement).
  const faceSign = sign(n.x.add(n.z)).mul(13.0).add(select(sideways, float(29.0), float(0.0)));
  const cell = floor(horiz.div(colW)).add(floor(wp.y.div(rowH)).mul(57.0)).add(faceSign);
  const lit = step(0.86, hash(cell));
  const glass = mix(vec3(0.18, 0.22, 0.32), vec3(0.95, 0.8, 0.55), lit);

  mat.colorNode = mix(mix(vec3(1, 1, 1), vec3(1.15, 1.12, 1.08), frame), glass, win);
  // Reflets du soleil levant sur les vitres + quelques fenêtres encore allumées
  const reflect = hash(cell.add(3.7)).mul(0.25).add(0.1);
  mat.emissiveNode = win.mul(mix(color(0xffb38a).mul(reflect), vec3(0.9, 0.62, 0.3), lit));
  mat.roughnessNode = mix(float(0.85), float(0.25), win);
  return mat;
}

export function vertexColorMaterial(opts: { roughness?: number; flat?: boolean } = {}): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.8,
    flatShading: opts.flat ?? true,
  });
}

export function plainMaterial(hex: number, roughness = 0.9, flat = false): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: hex, roughness, flatShading: flat });
}
