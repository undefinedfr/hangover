import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  hash,
  mix,
  positionWorld,
  step,
  color,
  fwidth,
  max,
  smoothstep,
  mx_noise_float,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { isLite } from '../core/Quality';

/** Bruit procédural, neutralisé en qualité basse (très coûteux sans GPU). */
function noise(p: Node<'vec3'>): Node<'float'> {
  return isLite() ? float(0) : mx_noise_float(p);
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

/** Anti-crénelage des motifs : 1 de près, 0 quand le motif devient plus fin qu'un pixel. */
function detail(coord: Node<'float'>, scale = 1): Node<'float'> {
  return float(1).sub(smoothstep(0.25, 0.9, fwidth(coord).mul(scale)));
}

/** Trottoir en dalles de pierre décalées, joints et nuances par dalle. */
export function pavingMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
  const wp = positionWorld;
  const row = floor(wp.z.div(0.62));
  const u = wp.x.div(1.05).add(row.mul(0.5));
  const cellX = floor(u);
  const jx = abs(fract(u).sub(0.5));
  const jz = abs(fract(wp.z.div(0.62)).sub(0.5));
  const joint = smoothstep(0.47, 0.5, max(jx, jz)).mul(detail(wp.x, 1.2));
  const tint = hash(cellX.add(row.mul(71.3))).sub(0.5).mul(0.07);
  const base = color(0xd9d1c4).mul(tint.add(1)).mul(noise(wp.mul(0.25)).mul(0.04).add(1));
  mat.colorNode = mix(base, base.mul(0.8), joint);
  return mat;
}

/** Enrobé : grain fin, rapiéçages, légère usure. */
export function asphaltMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const wp = positionWorld;
  const patches = smoothstep(0.35, 0.6, noise(wp.mul(0.045)).add(0.5));
  const grain = noise(wp.mul(2.3)).mul(0.05).mul(detail(wp.x, 2));
  const base = mix(color(0x4f505c), color(0x45464f), patches);
  mat.colorNode = base.mul(grain.add(1)).mul(noise(wp.mul(0.2)).mul(0.05).add(1));
  return mat;
}

/** Caniveau en pavés. */
export function cobbleMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const wp = positionWorld;
  const cx = fract(wp.x.div(0.22));
  const cz = fract(wp.z.div(0.22));
  const j = smoothstep(0.38, 0.5, max(abs(cx.sub(0.5)), abs(cz.sub(0.5)))).mul(detail(wp.x, 5));
  const tint = hash(floor(wp.x.div(0.22)).add(floor(wp.z.div(0.22)).mul(57))).sub(0.5).mul(0.12);
  const base = color(0x8d8a86).mul(tint.add(1));
  mat.colorNode = mix(base, base.mul(0.55), j);
  return mat;
}

/** Allées de parc en gravier clair. */
export function gravelMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const wp = positionWorld;
  const speck = step(0.78, hash(floor(wp.x.mul(18)).add(floor(wp.z.mul(18)).mul(131)))).mul(detail(wp.x, 18));
  mat.colorNode = mix(color(0xe3d3ae), color(0xb9a883), speck.mul(0.8)).mul(noise(wp.mul(0.3)).mul(0.05).add(1));
  return mat;
}

/** Pelouse tondue en bandes. */
export function lawnMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const wp = positionWorld;
  const stripe = step(0.5, fract(wp.x.div(3)));
  const n = noise(wp.mul(0.18)).mul(0.08);
  mat.colorNode = mix(color(0x86bf5f), color(0x9acc6c), stripe).mul(n.add(1));
  return mat;
}
