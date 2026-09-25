import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { part, merge } from '../world/Batch';
import { vertexColorMaterial } from '../world/materials';
import { Vehicle } from './Vehicle';
import { WALK_SPEED } from '../player/Player';

const box = new THREE.BoxGeometry(1, 1, 1);
const mat = vertexColorMaterial();

/** Trottinette : deux fois la vitesse de marche. */
export class Scooter extends Vehicle {
  private readonly wheels: THREE.Mesh[] = [];
  private readonly bar: THREE.Group;
  private roll = 0;
  steerVisual = 0;

  constructor(physics: Physics, x: number, y: number, z: number, yaw: number) {
    super(
      {
        name: 'trottinette',
        label: 'la trottinette',
        half: [0.3, 0.45, 0.6],
        maxSpeed: WALK_SPEED * 2,
        reverseSpeed: 2,
        accel: 7,
        brake: 12,
        steer: 2.6,
        seat: [0, 0.14, -0.05],
        pose: 'ride',
        cameraDistance: 5.5,
      },
      physics,
      x,
      y,
      z,
      yaw,
    );
    const deck = merge([
      part(box, 0x5dd39e, [0, 0.12, -0.05], [0, 0, 0], [0.2, 0.05, 0.9]),
      part(box, 0x2d2640, [0, 0.1, -0.53], [0, 0, 0], [0.16, 0.04, 0.14]),
    ]);
    const deckMesh = new THREE.Mesh(deck, mat);
    deckMesh.castShadow = true;
    this.object.add(deckMesh);

    this.bar = new THREE.Group();
    this.bar.position.set(0, 0.1, 0.42);
    const stem = new THREE.Mesh(
      merge([
        part(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), 0xc9c9d4, [0, 0.55, 0], [-0.12, 0, 0]),
        part(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 6), 0x2d2640, [0, 1.03, -0.06], [0, 0, Math.PI / 2]),
        part(box, 0xff6f59, [0, 0.2, 0.02], [0, 0, 0], [0.06, 0.25, 0.08]),
      ]),
      mat,
    );
    stem.castShadow = true;
    this.bar.add(stem);
    this.object.add(this.bar);

    const wheelGeo = merge([part(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), 0x1e1e26, [0, 0, 0], [0, 0, Math.PI / 2])]);
    for (const wz of [0.45, -0.5]) {
      const w = new THREE.Mesh(wheelGeo, mat);
      w.position.set(0, 0.09, wz);
      this.object.add(w);
      this.wheels.push(w);
    }
  }

  protected animateParts(dt: number): void {
    this.roll += (this.speed * dt) / 0.09;
    for (const w of this.wheels) w.rotation.x = this.roll;
    this.bar.rotation.y = this.steerVisual * 0.4;
  }
}
