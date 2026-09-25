import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { part, merge } from '../world/Batch';
import { vertexColorMaterial } from '../world/materials';
import { Vehicle } from './Vehicle';
import { WALK_SPEED } from '../player/Player';

const box = new THREE.BoxGeometry(1, 1, 1);
const mat = vertexColorMaterial();

/** Tricycle d'enfant (taille adulte, on ne juge pas) : un peu plus lent que la trottinette. */
export class Tricycle extends Vehicle {
  private readonly front: THREE.Group;
  private readonly frontWheel: THREE.Group;
  private readonly backWheels: THREE.Mesh[] = [];
  private roll = 0;
  steerVisual = 0;
  /** Angle des pédales (pour l'animation du joueur). */
  pedalAngle = 0;

  constructor(physics: Physics, x: number, y: number, z: number, yaw: number) {
    super(
      {
        name: 'tricycle',
        label: 'le tricycle',
        half: [0.45, 0.45, 0.65],
        maxSpeed: WALK_SPEED * 1.75,
        reverseSpeed: 1.5,
        accel: 5,
        brake: 10,
        steer: 2.3,
        seat: [0, -0.02, -0.28],
        pose: 'pedal',
        cameraDistance: 5.5,
      },
      physics,
      x,
      y,
      z,
      yaw,
    );
    const frame = merge([
      part(box, 0xe8504a, [0, 0.4, 0], [0, 0, 0], [0.08, 0.08, 0.9]),
      part(box, 0xe8504a, [0, 0.28, -0.42], [0, 0, 0], [0.8, 0.07, 0.07]),
      part(box, 0x2d2640, [0, 0.62, -0.25], [0, 0, 0], [0.36, 0.08, 0.3]),
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), 0xe8504a, [0, 0.5, -0.25]),
    ]);
    const frameMesh = new THREE.Mesh(frame, mat);
    frameMesh.castShadow = true;
    this.object.add(frameMesh);

    this.front = new THREE.Group();
    this.front.position.set(0, 0, 0.42);
    const fork = new THREE.Mesh(
      merge([
        part(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), 0xe8504a, [0, 0.62, 0]),
        part(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), 0xc9c9d4, [0, 0.98, -0.05], [0, 0, Math.PI / 2]),
        part(box, 0x5dd39e, [0.3, 0.98, -0.05], [0, 0, 0], [0.1, 0.06, 0.06]),
        part(box, 0x5dd39e, [-0.3, 0.98, -0.05], [0, 0, 0], [0.1, 0.06, 0.06]),
      ]),
      mat,
    );
    fork.castShadow = true;
    this.front.add(fork);
    this.frontWheel = new THREE.Group();
    this.frontWheel.position.y = 0.3;
    const fw = new THREE.Mesh(
      merge([
        part(new THREE.TorusGeometry(0.27, 0.04, 6, 16), 0x1e1e26, [0, 0, 0], [0, Math.PI / 2, 0]),
        part(box, 0xc9c9d4, [0, 0, 0], [0, 0, 0], [0.03, 0.5, 0.03]),
        part(box, 0xc9c9d4, [0, 0, 0], [Math.PI / 2, 0, 0], [0.03, 0.5, 0.03]),
        // Pédales
        part(box, 0x2d2640, [0.18, 0.14, 0], [0, 0, 0], [0.14, 0.04, 0.08]),
        part(box, 0x2d2640, [-0.18, -0.14, 0], [0, 0, 0], [0.14, 0.04, 0.08]),
        part(box, 0xc9c9d4, [0, 0, 0], [0, 0, 0], [0.4, 0.02, 0.02]),
      ]),
      mat,
    );
    fw.castShadow = true;
    this.frontWheel.add(fw);
    this.front.add(this.frontWheel);
    this.object.add(this.front);

    const bw = merge([part(new THREE.TorusGeometry(0.16, 0.035, 6, 14), 0x1e1e26, [0, 0, 0], [0, Math.PI / 2, 0])]);
    for (const x of [0.38, -0.38]) {
      const w = new THREE.Mesh(bw, mat);
      w.position.set(x, 0.18, -0.42);
      w.castShadow = true;
      this.object.add(w);
      this.backWheels.push(w);
    }
  }

  protected animateParts(dt: number): void {
    this.roll += (this.speed * dt) / 0.27;
    this.frontWheel.rotation.x = this.roll;
    for (const w of this.backWheels) w.rotation.x = (this.roll * 0.27) / 0.16;
    this.front.rotation.y = this.steerVisual * 0.5;
    this.pedalAngle = this.roll;
  }
}
