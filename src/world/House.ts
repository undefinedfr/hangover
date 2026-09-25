import * as THREE from 'three/webgpu';
import { SLAB_H } from './constants';
import { part, merge } from './Batch';
import { frustum } from './Architecture';

const box = new THREE.BoxGeometry(1, 1, 1);

/**
 * La maison d'arrivée : « la maison bleue ». Enduit bleu, encadrements en pierre, volets,
 * jardinières fleuries, toit de tuiles à quatre pans, marquise vitrée au-dessus de la porte jaune.
 * Façade vers +z local.
 */
export function buildHouse(
  x: number,
  z: number,
  rot: number,
  w: number,
  depth: number,
  h: number,
): { object: THREE.Group; door: { x: number; z: number } } {
  const g = new THREE.Group();
  const front = depth / 2;
  const stone = 0xf1e7d4;
  const blue = 0x8fb3d6;
  const shutter = 0x2f5d8a;
  const parts: THREE.BufferGeometry[] = [
    part(box, blue, [0, h / 2, 0], [0, 0, 0], [w, h, depth]),
    // Soubassement en pierre, bandeau d'étage, corniche
    part(box, 0xcfc4b0, [0, 0.3, 0], [0, 0, 0], [w + 0.08, 0.6, depth + 0.08]),
    part(box, stone, [0, 3.3, 0], [0, 0, 0], [w + 0.14, 0.16, depth + 0.14]),
    part(box, stone, [0, h - 0.15, 0], [0, 0, 0], [w + 0.4, 0.3, depth + 0.4]),
    // Chaînages d'angle
    ...[-1, 1].map((sx) => part(box, stone, [sx * (w / 2 - 0.12), h / 2, front - 0.12], [0, 0, 0], [0.3, h, 0.3])),
  ];

  // Fenêtres : encadrement pierre, vitre, croisillons, volets, jardinière
  const windowAt = (cx: number, cy: number, ww: number, wh: number, withBox: boolean) => {
    parts.push(part(box, stone, [cx, cy, front + 0.03], [0, 0, 0], [ww + 0.3, wh + 0.3, 0.08]));
    parts.push(part(box, 0x26303f, [cx, cy, front + 0.075], [0, 0, 0], [ww, wh, 0.02]));
    parts.push(part(box, 0xf6f1e6, [cx, cy, front + 0.09], [0, 0, 0], [0.05, wh, 0.02]));
    parts.push(part(box, 0xf6f1e6, [cx, cy + wh * 0.2, front + 0.09], [0, 0, 0], [ww, 0.05, 0.02]));
    for (const sx of [-1, 1]) {
      parts.push(part(box, shutter, [cx + sx * (ww / 2 + 0.33), cy, front + 0.06], [0, sx * 0.08, 0], [0.42, wh + 0.1, 0.05]));
      for (let k = -2; k <= 2; k++) {
        parts.push(part(box, 0x244a70, [cx + sx * (ww / 2 + 0.33), cy + k * (wh / 6), front + 0.09], [0, 0, 0], [0.4, 0.03, 0.02]));
      }
    }
    if (withBox) {
      parts.push(part(box, 0x8a5a3a, [cx, cy - wh / 2 - 0.14, front + 0.2], [0, 0, 0], [ww + 0.2, 0.2, 0.28]));
      for (let k = 0; k < 6; k++) {
        const fx = cx - ww / 2 + (k + 0.5) * (ww / 6);
        const col = [0xe8504a, 0xffd24a, 0xf2f2f2, 0xd96aa7][k % 4];
        parts.push(part(new THREE.IcosahedronGeometry(0.1, 0), col, [fx, cy - wh / 2 + 0.02, front + 0.24]));
        parts.push(part(new THREE.IcosahedronGeometry(0.09, 0), 0x4f8a45, [fx + 0.06, cy - wh / 2 - 0.02, front + 0.22]));
      }
    }
  };
  windowAt(-w * 0.3, 1.75, 1.0, 1.5, false);
  windowAt(w * 0.3, 1.75, 1.0, 1.5, false);
  windowAt(-w * 0.3, h - 1.75, 1.0, 1.45, true);
  windowAt(w * 0.3, h - 1.75, 1.0, 1.45, true);
  windowAt(0, h - 1.75, 0.8, 1.45, true);

  // Porte jaune : encadrement, imposte, poignée, marquise vitrée
  parts.push(part(box, stone, [0, 1.3, front + 0.04], [0, 0, 0], [1.7, 2.7, 0.08]));
  parts.push(part(box, 0xffd24a, [0, 1.17, front + 0.08], [0, 0, 0], [1.25, 2.3, 0.06]));
  parts.push(part(box, 0xe0b73a, [0, 1.6, front + 0.115], [0, 0, 0], [1.0, 0.9, 0.02]));
  parts.push(part(box, 0xe0b73a, [0, 0.6, front + 0.115], [0, 0, 0], [1.0, 0.7, 0.02]));
  parts.push(part(box, 0x26303f, [0, 2.48, front + 0.08], [0, 0, 0], [1.25, 0.3, 0.03]));
  parts.push(part(new THREE.SphereGeometry(0.06, 10, 8), 0x8a6a2a, [0.45, 1.15, front + 0.15]));
  parts.push(part(box, 0x21352c, [0, 2.95, front + 0.5], [-0.25, 0, 0], [2.0, 0.05, 1.0]));
  parts.push(part(box, 0xbcd7e6, [0, 2.97, front + 0.5], [-0.25, 0, 0], [1.9, 0.02, 0.92]));
  for (const sx of [-1, 1]) parts.push(part(box, 0x21352c, [sx * 0.9, 2.75, front + 0.35], [0.6, 0, 0], [0.04, 0.5, 0.04]));
  // Marche et paillasson
  parts.push(part(box, 0xcfc7bd, [0, 0.07, front + 0.45], [0, 0, 0], [2.2, 0.14, 0.9]));
  parts.push(part(box, 0x9a6a3a, [0, 0.15, front + 0.5], [0, 0, 0], [1.3, 0.02, 0.6]));
  // Numéro de rue émaillé bleu (Paris)
  parts.push(part(box, 0x2d4a7a, [1.05, 2.3, front + 0.06], [0, 0, 0], [0.3, 0.22, 0.02]));
  parts.push(part(box, 0xf6f1e6, [1.05, 2.3, front + 0.071], [0, 0, 0], [0.12, 0.12, 0.01]));

  // Toit de tuiles à quatre pans et cheminée
  parts.push(frustum(w + 0.6, depth + 0.6, 2.6, Math.min(w, depth) / 2 - 0.3, 0xd0603e).translate(0, h, 0));
  parts.push(part(box, 0xe6d6bd, [w * 0.25, h + 2.1, -depth * 0.1], [0, 0, 0], [0.8, 1.6, 0.8]));
  parts.push(part(new THREE.CylinderGeometry(0.12, 0.14, 0.4, 6), 0xd0643c, [w * 0.25, h + 3.0, -depth * 0.1]));

  // Boîte aux lettres dans le jardin
  parts.push(part(box, 0x6b4a1e, [-1.7, 0.55, front + 2.6], [0, 0, 0], [0.1, 1.1, 0.1]));
  parts.push(part(box, 0x2f5d50, [-1.7, 1.2, front + 2.6], [0, 0, 0], [0.5, 0.35, 0.7]));

  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  const sign = signMesh('MAISON', 'Enfin.');
  sign.position.set(0, 3.7, front + 0.08);
  g.add(sign);

  g.position.set(x, SLAB_H, z);
  g.rotation.y = rot;
  const dz = front + 1.2;
  return {
    object: g,
    door: { x: x + Math.sin(rot) * dz, z: z + Math.cos(rot) * dz },
  };
}

function signMesh(title: string, sub: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff7ee';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#2d4a7a';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = '#2d4a7a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px Trebuchet MS, sans-serif';
  ctx.fillText(title, 128, 48);
  ctx.font = 'italic 24px Trebuchet MS, sans-serif';
  ctx.fillText(sub, 128, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.05), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 }));
}
