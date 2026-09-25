import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { part, merge } from '../world/Batch';
import { vertexColorMaterial } from '../world/materials';
import { carBodyParts, wheelGeometry, WHEEL_POS } from '../world/props';
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
    const body = merge([
      ...carBodyParts(paint),
      // Cône de chantier sur le toit (souvenir de la soirée)
      part(new THREE.ConeGeometry(0.26, 0.72, 10), 0xff8a3d, [0.2, 1.92, -0.45], [0, 0, 0.3]),
      part(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 10), 0xffffff, [0.18, 1.86, -0.45], [0, 0, 0.3]),
      part(box, 0xff8a3d, [0.08, 1.56, -0.45], [0, 0, 0.3], [0.55, 0.05, 0.55]),
    ]);
    const bodyMesh = new THREE.Mesh(body, mat);
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    this.object.add(bodyMesh);

    const wheelGeo = wheelGeometry();
    for (const [wx, wz] of WHEEL_POS) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.34, wz);
      const w = new THREE.Mesh(wheelGeo, mat);
      w.castShadow = true;
      pivot.add(w);
      this.object.add(pivot);
      this.wheels.push(w);
      if (wz > 0) this.frontPivots.push(pivot);
    }
  }

  protected animateParts(dt: number): void {
    this.roll += (this.speed * dt) / 0.34;
    for (const w of this.wheels) w.rotation.x = this.roll;
    for (const p of this.frontPivots) p.rotation.y = this.steerVisual * 0.45;
  }
}
