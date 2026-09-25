import * as THREE from 'three/webgpu';
import { SLAB_H } from './constants';
import { gableGeometry } from './props';
import { plainMaterial } from './materials';

/** La maison d'arrivée : bleue, toit rouge, grosse porte jaune. Façade vers +z local. */
export function buildHouse(
  x: number,
  z: number,
  rot: number,
  w: number,
  depth: number,
  h: number,
): { object: THREE.Group; door: { x: number; z: number } } {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), plainMaterial(0x7fb7e6, 0.85));
  walls.position.y = h / 2;
  const roof = new THREE.Mesh(gableGeometry(), plainMaterial(0xe8504a, 0.8, true));
  roof.scale.set(w + 0.8, 2.6, depth + 0.8);
  roof.position.y = h;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), plainMaterial(0xb0564a));
  chimney.position.set(w * 0.28, h + 1.6, -depth * 0.15);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.12), plainMaterial(0xffd24a, 0.6));
  door.position.set(0, 1.15, depth / 2 + 0.05);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), plainMaterial(0x6b4a1e, 0.3));
  knob.position.set(0.45, 1.1, depth / 2 + 0.14);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1), plainMaterial(0xcfc7bd));
  step.position.set(0, 0.075, depth / 2 + 0.5);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.7), plainMaterial(0xa0703f));
  mat.position.set(0, 0.17, depth / 2 + 0.55);

  const winMat = plainMaterial(0x2b3550, 0.2);
  const frameMat = plainMaterial(0xffffff, 0.7);
  for (const sx of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.1), frameMat);
    frame.position.set(sx * w * 0.3, h * 0.55, depth / 2 + 0.03);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.05, 0.1), winMat);
    glass.position.set(sx * w * 0.3, h * 0.55, depth / 2 + 0.06);
    g.add(frame, glass);
  }

  // Boîte aux lettres avec une pancarte
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), plainMaterial(0x6b4a1e));
  post.position.set(-1.7, 0.55, depth / 2 + 2.6);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), plainMaterial(0xe8504a));
  box.position.set(-1.7, 1.2, depth / 2 + 2.6);
  g.add(post, box);

  const sign = signMesh('MAISON', 'Enfin.');
  sign.position.set(0, h * 0.86, depth / 2 + 0.08);
  g.add(walls, roof, chimney, door, knob, step, mat, sign);

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  g.position.set(x, SLAB_H, z);
  g.rotation.y = rot;
  const dz = depth / 2 + 1.2;
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
  ctx.fillStyle = '#2d2640';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px Trebuchet MS, sans-serif';
  ctx.fillText(title, 128, 48);
  ctx.font = 'italic 24px Trebuchet MS, sans-serif';
  ctx.fillText(sub, 128, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.68, 0.05), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 }));
}
