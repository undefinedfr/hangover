import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { part, merge } from '../world/Batch';
import { vertexColorMaterial } from '../world/materials';
import { Vehicle } from './Vehicle';

const box = new THREE.BoxGeometry(1, 1, 1);
const mat = vertexColorMaterial();

/** Ta voiture : turquoise, un cône de chantier sur le toit (souvenir de la soirée). */
export class Car extends Vehicle {
  private readonly wheels: THREE.Mesh[] = [];
  private readonly frontPivots: THREE.Group[] = [];
  private roll = 0;
  steerVisual = 0;

  constructor(physics: Physics, x: number, y: number, z: number, yaw: number) {
    super(
      {
        name: 'voiture',
        label: 'la voiture',
        half: [0.92, 0.62, 2.05],
        maxSpeed: 17,
        reverseSpeed: 5,
        accel: 9,
        brake: 16,
        steer: 1.7,
        seat: [0.4, 0.2, -0.1],
        pose: 'hidden',
        cameraDistance: 8,
      },
      physics,
      x,
      y,
      z,
      yaw,
    );
    const paint = 0x3fb6b0;
    const glass = 0x2b3550;
    const body = merge([
      part(box, paint, [0, 0.66, 0], [0, 0, 0], [1.84, 0.64, 4.1]),
      part(box, paint, [0, 1.22, -0.25], [0, 0, 0], [1.64, 0.52, 2.15]),
      part(box, glass, [0, 1.23, 0.84], [-0.5, 0, 0], [1.52, 0.44, 0.06]),
      part(box, glass, [0, 1.23, -1.34], [0.45, 0, 0], [1.52, 0.44, 0.06]),
      part(box, glass, [0.83, 1.23, -0.25], [0, 0, 0], [0.03, 0.38, 1.85]),
      part(box, glass, [-0.83, 1.23, -0.25], [0, 0, 0], [0.03, 0.38, 1.85]),
      part(box, 0xfff2b8, [0.6, 0.74, 2.06], [0, 0, 0], [0.38, 0.18, 0.04]),
      part(box, 0xfff2b8, [-0.6, 0.74, 2.06], [0, 0, 0], [0.38, 0.18, 0.04]),
      part(box, 0xd9434c, [0.62, 0.76, -2.06], [0, 0, 0], [0.32, 0.15, 0.04]),
      part(box, 0xd9434c, [-0.62, 0.76, -2.06], [0, 0, 0], [0.32, 0.15, 0.04]),
      part(box, 0xf2f2f2, [0, 0.55, -2.07], [0, 0, 0], [0.6, 0.18, 0.03]),
      // Cône de chantier sur le toit
      part(new THREE.ConeGeometry(0.28, 0.75, 8), 0xff8a3d, [0.25, 1.86, -0.3], [0, 0, 0.25]),
      part(box, 0xff8a3d, [0.2, 1.5, -0.3], [0, 0, 0.25], [0.6, 0.06, 0.6]),
      part(new THREE.CylinderGeometry(0.19, 0.22, 0.12, 8), 0xffffff, [0.24, 1.78, -0.3], [0, 0, 0.25]),
    ]);
    const bodyMesh = new THREE.Mesh(body, mat);
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    this.object.add(bodyMesh);

    const wheelGeo = merge([
      part(new THREE.CylinderGeometry(0.37, 0.37, 0.28, 12), 0x1e1e26, [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), 0xc9c9d4, [0, 0, 0], [0, 0, Math.PI / 2]),
    ]);
    for (const [wx, wz] of [
      [0.86, 1.32],
      [-0.86, 1.32],
      [0.86, -1.32],
      [-0.86, -1.32],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.37, wz);
      const w = new THREE.Mesh(wheelGeo, mat);
      w.castShadow = true;
      pivot.add(w);
      this.object.add(pivot);
      this.wheels.push(w);
      if (wz > 0) this.frontPivots.push(pivot);
    }
  }

  protected animateParts(dt: number): void {
    this.roll += (this.speed * dt) / 0.37;
    for (const w of this.wheels) w.rotation.x = this.roll;
    for (const p of this.frontPivots) p.rotation.y = this.steerVisual * 0.45;
  }
}
