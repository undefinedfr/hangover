import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  float,
  floor,
  fract,
  fwidth,
  hash,
  attribute,
  max,
  min,
  mix,
  mx_noise_float,
  normalGeometry,
  positionGeometry,
  positionWorld,
  select,
  smoothstep,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { isLite } from '../core/Quality';

type N = Node<'float'>;
type V3 = Node<'vec3'>;

/** Pas anti-crénelé : 0 avant `edge`, 1 après, transition d'un pixel. */
function aastep(edge: N | number, x: N): N {
  const w = max(fwidth(x).mul(0.75), float(1e-4));
  return smoothstep(float(edge as number).sub(w), float(edge as number).add(w), x);
}

/** Masque d'un intervalle [a, b] anti-crénelé. */
function band(x: N, a: N | number, b: N | number): N {
  return aastep(a, x).mul(float(1).sub(aastep(b, x)));
}

export const GROUND_FLOOR = 4.0;
export const TOP_BAND = 0.7;
export const FLOOR_H = 3.0;
export const COL_W = 2.9;
export const SHOP_W = 4.2;

/** Répartition des travées d'une façade (partagée entre shader et géométrie). */
export function facadeLayout(width: number, height: number) {
  const upper = height - GROUND_FLOOR - TOP_BAND;
  const floors = Math.max(1, Math.floor(upper / FLOOR_H));
  const cols = Math.max(1, Math.floor(width / COL_W));
  const bays = Math.max(1, Math.floor(width / SHOP_W));
  return { floors, floorH: upper / floors, cols, colW: width / cols, bays, bayW: width / bays };
}

/**
 * Façades procédurales (TSL) alignées sur les arêtes de chaque bâtiment grâce aux attributs
 * d'instance : taille (w, h, d), couleur du mur, style (0 = haussmannien, 1 = faubourg),
 * graine, couleur d'accent (devantures, volets).
 */
export function facadeMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  // Attributs d'instance lus par nom sur la géométrie : un seul shader pour toutes les tuiles
  const aSize = attribute('aSize', 'vec3') as unknown as V3;
  const aWall = attribute('aWall', 'vec3') as unknown as V3;
  const aInfo = attribute('aInfo', 'vec2') as unknown as Node<'vec2'>;
  const aAccent = attribute('aAccent', 'vec3') as unknown as V3;

  const p = positionGeometry;
  const n = normalGeometry;
  const sideX = abs(n.x).greaterThan(0.5);
  const isRoof = n.y.greaterThan(0.5);
  const w = aSize.x;
  const h = aSize.y;
  const d = aSize.z;
  const W = select(sideX, d, w);
  const s = select(sideX, p.z.add(0.5).mul(d), p.x.add(0.5).mul(w));
  const y = p.y.mul(h);
  const style = aInfo.x; // 0 haussmannien, 1 faubourg
  const seed = aInfo.y;
  const faub = style.greaterThan(0.5);
  const faceId = select(sideX, float(1), float(0)).add(select(n.x.add(n.z).greaterThan(0), float(2), float(0)));

  // --- Étages ---
  const upper = h.sub(GROUND_FLOOR + TOP_BAND);
  const floors = max(float(1), floor(upper.div(FLOOR_H)));
  const fh = upper.div(floors);
  const yU = y.sub(GROUND_FLOOR);
  const floorIdx = floor(yU.div(fh));
  const fy = fract(yU.div(fh)).mul(fh);
  const cols = max(float(1), floor(W.div(COL_W)));
  const cw = W.div(cols);
  const colIdx = floor(s.div(cw));
  const cx = fract(s.div(cw)).sub(0.5).mul(cw);
  const acx = abs(cx);
  const inUpper = aastep(GROUND_FLOOR, y).mul(float(1).sub(aastep(h.sub(TOP_BAND), y)));

  const ww = select(faub, min(float(0.5), cw.mul(0.5).sub(0.9)), min(float(0.62), cw.mul(0.5).sub(0.4)));
  const wy0 = select(faub, float(0.7), float(0.22));
  const wy1 = fh.sub(select(faub, float(0.55), float(0.5)));
  const glass = band(acx, -1, ww).mul(band(fy, wy0, wy1)).mul(inUpper);
  const frame = band(acx, -1, ww.add(0.14)).mul(band(fy, wy0.sub(0.12), wy1.add(0.18))).mul(inUpper).sub(glass);
  const mullion = float(1).sub(aastep(0.035, acx)).mul(glass);
  const transom = band(fy, wy1.sub(0.5), wy1.sub(0.45)).mul(glass);
  const bars = mullion.add(transom).clamp(0, 1);

  // Garde-corps en fer forgé (sauf étages à balcon filant, gérés en géométrie)
  const balconyFloor = floorIdx.equal(1).or(floorIdx.equal(floors.sub(1)));
  const railZone = band(acx, -1, ww.add(0.06)).mul(band(fy, wy0, wy0.add(0.95))).mul(inUpper);
  const barFar = smoothstep(0.2, 0.7, fwidth(cx.mul(8)));
  const railBars = mix(aastep(0.75, fract(cx.mul(8))), float(0.35), barFar)
    .add(band(fy, wy0.add(0.88), wy0.add(0.95)))
    .clamp(0, 1);
  const rail = select(balconyFloor.or(faub), float(0), railZone.mul(railBars));

  // Volets (faubourg)
  const shutterIn = ww.add(0.06);
  const shutterOut = ww.add(0.06).add(ww.mul(0.9));
  const shutter = select(faub, band(acx, shutterIn, shutterOut).mul(band(fy, wy0, wy1)).mul(inUpper), float(0));
  const louvre = aastep(0.55, fract(fy.mul(9)));

  // Bandeaux d'étage
  const course = band(fy, fh.sub(0.14), fh).mul(inUpper).mul(select(faub, float(0.5), float(1)));

  // --- Rez-de-chaussée : devantures ---
  const inGround = float(1).sub(aastep(GROUND_FLOOR, y));
  const bays = max(float(1), floor(W.div(SHOP_W)));
  const bw = W.div(bays);
  const bayIdx = floor(s.div(bw));
  const bx = abs(fract(s.div(bw)).sub(0.5).mul(bw));
  const bhw = bw.mul(0.5).sub(0.55);
  const shopFrame = band(bx, -1, bhw.add(0.2)).mul(band(y, -1, 3.75)).mul(inGround);
  const shopGlass = band(bx, -1, bhw.sub(0.12)).mul(band(y, 0.3, 2.95)).mul(inGround);
  const sign = band(bx, -1, bhw.add(0.2)).mul(band(y, 3.1, 3.7)).mul(inGround);
  const jointFar = smoothstep(0.08, 0.3, fwidth(y.div(0.5)));
  const rustic = select(faub, float(0), float(1).sub(aastep(0.05, fract(y.div(0.5)).mul(0.5))).mul(inGround)).mul(
    float(1).sub(jointFar),
  );
  const plinth = float(1).sub(aastep(0.35, y));

  // --- Couleurs ---
  const wp = positionWorld;
  const fineFade = float(1).sub(smoothstep(0.3, 1.0, fwidth(wp.x.add(wp.z)).mul(3)));
  const grain = isLite()
    ? float(0)
    : mx_noise_float(wp.mul(0.35)).mul(0.05).add(mx_noise_float(wp.mul(3.1)).mul(0.02).mul(fineFade));
  const wallC = aWall.mul(grain.add(1));
  const frameC = wallC.mul(1.1).min(vec3(1));
  const iron = vec3(0.07, 0.08, 0.09);
  const cell = colIdx.add(floorIdx.mul(31)).add(seed.mul(997)).add(faceId.mul(7.3));
  const lit = aastep(0.9, hash(cell));
  const skyRefl = smoothstep(wy0, wy1, fy);
  const glassC = mix(mix(vec3(0.13, 0.16, 0.23), vec3(0.42, 0.47, 0.58), skyRefl.mul(0.7)), vec3(0.95, 0.78, 0.5), lit);
  const shopHash = hash(bayIdx.add(seed.mul(131)).add(faceId.mul(5.1)));
  const shopC = mix(aAccent, aAccent.mul(vec3(0.7, 1.1, 0.9)), shopHash);
  const shopGlassC = mix(vec3(0.1, 0.12, 0.15), vec3(0.34, 0.27, 0.2), smoothstep(0.3, 2.9, y).oneMinus().mul(0.5));

  let c: V3 = wallC;
  c = mix(c, wallC.mul(0.86), rustic);
  c = mix(c, wallC.mul(0.72), plinth.mul(inGround));
  c = mix(c, frameC, course);
  c = mix(c, frameC, frame);
  c = mix(c, glassC, glass);
  c = mix(c, frameC.mul(0.95), bars);
  c = mix(c, aAccent.mul(louvre.mul(0.25).add(0.8)), shutter);
  c = mix(c, iron, rail);
  c = mix(c, shopC, shopFrame);
  c = mix(c, shopGlassC, shopGlass);
  c = mix(c, shopC.mul(0.8), sign);
  // Occlusion factice : pied de façade et dessous de corniche
  const ao = mix(float(0.78), float(1), smoothstep(0, 0.9, y)).mul(mix(float(0.8), float(1), aastep(0.35, h.sub(y))));
  c = c.mul(ao);
  c = select(isRoof, vec3(0.34, 0.37, 0.42), c);

  mat.colorNode = c;
  const glassy = clamp(glass.add(shopGlass), 0, 1);
  mat.roughnessNode = mix(float(0.92), float(0.38), glassy);
  // Seules quelques fenêtres encore allumées émettent (le reflet du ciel est dans la couleur)
  mat.emissiveNode = glass.mul(lit).mul(vec3(0.85, 0.6, 0.3));
  return mat;
}
