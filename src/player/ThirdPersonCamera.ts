import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';

/** Caméra orbitale à la 3e personne, raccourcie quand un mur s'interpose. */
export class ThirdPersonCamera {
  yaw = Math.PI;
  pitch = 0.32;
  distance = 5.5;
  height = 1.6;
  private current = 5.5;
  private readonly target = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private initialized = false;
  sensitivity = 0.0025;

  constructor(readonly camera: THREE.PerspectiveCamera, private readonly physics: Physics) {}

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * this.sensitivity, -0.35, 1.2);
  }

  /** Direction « avant » de la caméra dans le plan horizontal. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  snap(): void {
    this.initialized = false;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.target.set(focus.x, focus.y + this.height, focus.z);
    if (!this.initialized) {
      this.smoothedTarget.copy(this.target);
      this.current = this.distance;
      this.initialized = true;
    } else {
      this.smoothedTarget.lerp(this.target, 1 - Math.exp(-dt * 14));
    }
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);

    // Collision caméra / murs : on raccourcit la perche
    const hit = this.physics.raycast(this.smoothedTarget, dir, this.distance + 0.3);
    const wanted = hit !== null ? Math.max(0.6, hit - 0.35) : this.distance;
    // Se rapproche instantanément, s'éloigne en douceur
    this.current = wanted < this.current ? wanted : this.current + (wanted - this.current) * (1 - Math.exp(-dt * 4));

    this.camera.position.copy(this.smoothedTarget).addScaledVector(dir, this.current);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.camera.lookAt(this.smoothedTarget);
  }
}
