import * as THREE from 'three/webgpu';
import type { ItemId } from '../core/GameState';
import { part, merge } from '../world/Batch';

const box = new THREE.BoxGeometry(1, 1, 1);

function glasses(): THREE.BufferGeometry {
  const rim = new THREE.TorusGeometry(0.1, 0.018, 6, 16);
  const lens = new THREE.CircleGeometry(0.095, 14);
  return merge([
    part(rim, 0x2d2640, [-0.12, 0, 0]),
    part(rim, 0x2d2640, [0.12, 0, 0]),
    part(lens, 0x8fd3f0, [-0.12, 0, 0.001]),
    part(lens, 0x8fd3f0, [0.12, 0, 0.001]),
    part(lens, 0x8fd3f0, [-0.12, 0, -0.001], [0, Math.PI, 0]),
    part(lens, 0x8fd3f0, [0.12, 0, -0.001], [0, Math.PI, 0]),
    part(box, 0x2d2640, [0, 0.03, 0], [0, 0, 0], [0.06, 0.02, 0.02]),
    part(box, 0x2d2640, [-0.23, 0.02, -0.12], [0, 0, 0], [0.02, 0.02, 0.26]),
    part(box, 0x2d2640, [0.23, 0.02, -0.12], [0, 0, 0], [0.02, 0.02, 0.26]),
  ]);
}

function phone(): THREE.BufferGeometry {
  return merge([
    part(box, 0x23232e, [0, 0, 0], [0, 0, 0], [0.16, 0.3, 0.025]),
    part(box, 0x6fd3ff, [0, 0.01, 0.013], [0, 0, 0], [0.135, 0.24, 0.004]),
    part(box, 0xff6f59, [0, 0.08, 0.016], [0, 0, 0], [0.08, 0.03, 0.002]),
  ]);
}

function wallet(): THREE.BufferGeometry {
  return merge([
    part(box, 0x8a4f2a, [0, 0, 0], [0, 0, 0], [0.24, 0.17, 0.05]),
    part(box, 0x6b3b1f, [0, 0.03, 0.026], [0, 0, 0], [0.22, 0.02, 0.004]),
    part(box, 0xf2d06b, [0.06, 0.1, 0], [0, 0, 0.2], [0.1, 0.05, 0.03]), // un billet qui dépasse
  ]);
}

function carKeys(): THREE.BufferGeometry {
  return merge([
    part(new THREE.TorusGeometry(0.05, 0.012, 6, 14), 0xc9c9d4, [0, 0.1, 0]),
    part(box, 0x23232e, [0, 0, 0], [0, 0, 0], [0.09, 0.14, 0.04]),
    part(box, 0xe8504a, [0, 0.02, 0.021], [0, 0, 0], [0.04, 0.04, 0.004]),
    part(box, 0xc9c9d4, [0, -0.13, 0], [0, 0, 0], [0.035, 0.14, 0.012]),
  ]);
}

function houseKeys(): THREE.BufferGeometry {
  const key = (x: number, rz: number) => [
    part(new THREE.TorusGeometry(0.035, 0.012, 6, 12), 0xf2c14e, [x, 0, 0], [0, 0, rz]),
    part(box, 0xf2c14e, [x + Math.sin(-rz) * -0.1, -0.1 * Math.cos(rz), 0], [0, 0, rz], [0.025, 0.14, 0.012]),
  ];
  return merge([
    part(new THREE.TorusGeometry(0.06, 0.012, 6, 14), 0xc9c9d4, [0, 0.1, 0]),
    ...key(-0.04, 0.35),
    ...key(0.04, -0.35),
    // Porte-clés en forme de maison
    part(box, 0x5dd39e, [0.02, 0.2, 0], [0, 0, 0], [0.09, 0.07, 0.02]),
    part(box, 0xe8504a, [0.02, 0.25, 0], [0, 0, Math.PI / 4], [0.07, 0.07, 0.021]),
  ]);
}

const builders: Record<ItemId, () => THREE.BufferGeometry> = {
  lunettes: glasses,
  telephone: phone,
  portefeuille: wallet,
  clesVoiture: carKeys,
  clesMaison: houseKeys,
};

const cache = new Map<ItemId, THREE.BufferGeometry>();

export function itemGeometry(id: ItemId): THREE.BufferGeometry {
  let g = cache.get(id);
  if (!g) {
    g = builders[id]();
    cache.set(id, g);
  }
  return g;
}
