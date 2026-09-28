import * as THREE from 'three/webgpu';
import {
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
  uv,
  vec2,
  length,
  vertexColor,
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

/** Enrobé : grain fin, rapiéçages, légère usure. */
export function asphaltMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const wp = positionWorld;
  const patches = smoothstep(0.35, 0.6, noise(wp.mul(0.045)).add(0.5));
  const grain = noise(wp.mul(2.3)).mul(0.05).mul(detail(wp.x, 2));
  const base = mix(color(0x5d5f64), color(0x53555a), patches);
  mat.colorNode = base.mul(grain.add(1)).mul(noise(wp.mul(0.2)).mul(0.05).add(1));
  return mat;
}

/** Pelouse tondue en bandes. */
export function lawnMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const wp = positionWorld;
  const stripe = step(0.5, fract(wp.x.div(3))).mul(0.5);
  const n = noise(wp.mul(0.18)).mul(0.08);
  mat.colorNode = mix(color(0x6f9c47), color(0x79a74f), stripe).mul(n.add(1));
  return mat;
}

/** Feuillage en cartes : grappes de feuilles découpées en alpha, nuances par grappe. */
export function leafMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const u = uv();
  // Deux grilles décalées de feuilles ovales qui se chevauchent : feuillage dense, bord déchiqueté
  const leafAt = (scale: number, offset: number) => {
    const st = u.mul(scale).add(offset);
    const cell = floor(st);
    const id = hash(cell.x.add(cell.y.mul(17.3)).add(offset * 31));
    const f = fract(st).sub(0.5).add(vec2(hash(id.add(1.3)).sub(0.5), hash(id.add(7.1)).sub(0.5)).mul(0.3));
    return { a: float(1).sub(smoothstep(0.34, 0.46, length(f.mul(vec2(1.0, 1.5))))), id };
  };
  const l1 = leafAt(4, 0);
  const l2 = leafAt(4, 0.5);
  const round = float(1).sub(smoothstep(0.3, 0.5, length(u.sub(0.5))));
  mat.opacityNode = max(l1.a, l2.a).mul(round).mul(1.5);
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  const shade = mix(l1.id, l2.id, step(l1.a, l2.a));
  mat.colorNode = vertexColor().mul(shade.mul(0.3).add(0.85));
  return mat;
}
