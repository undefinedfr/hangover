import * as THREE from 'three/webgpu';
import { float, uniform, uv, smoothstep, vec3, sin, time, color } from 'three/tsl';
import type { ItemId } from '../core/GameState';
import { itemGeometry } from './models';
import { vertexColorMaterial } from '../world/materials';

const itemMat = vertexColorMaterial({ roughness: 0.5, flat: false });

/** Objet ramassable : modèle procédural qui flotte et tourne, avec halo optionnel. */
export class Item {
  readonly object = new THREE.Group();
  private readonly model: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly haloOpacity = uniform(1);
  collected = false;
  private readonly phase: number;

  constructor(
    readonly id: ItemId,
    readonly position: THREE.Vector3,
    readonly label: string,
    private readonly haloDistance: number,
  ) {
    this.phase = position.x * 0.37 + position.z * 0.11;
    this.model = new THREE.Mesh(itemGeometry(id), itemMat);
    this.model.scale.setScalar(1.8);
    this.model.castShadow = true;
    this.object.add(this.model);

    // Halo : disque lumineux additif face caméra + colonne de lumière
    const glowMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const d = uv().sub(0.5).length().mul(2);
    const pulse = sin(time.mul(3)).mul(0.15).add(0.85);
    glowMat.colorNode = color(0xfff1a8);
    glowMat.opacityNode = float(1).sub(smoothstep(0.0, 1.0, d)).pow(2).mul(pulse).mul(this.haloOpacity);
    glowMat.fog = false;
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), glowMat);
    this.halo.renderOrder = 5;
    this.object.add(this.halo);

    const beamMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    beamMat.colorNode = vec3(1.0, 0.9, 0.55);
    beamMat.opacityNode = float(1).sub(uv().y).pow(1.5).mul(0.45).mul(this.haloOpacity);
    beamMat.fog = false;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 10, 1, true), beamMat);
    this.beam.position.y = 15;
    this.beam.renderOrder = 5;
    this.object.add(this.beam);

    this.object.position.copy(position);
    this.halo.visible = this.beam.visible = haloDistance > 0;
  }

  update(dt: number, camera: THREE.Camera, playerPos: THREE.Vector3): void {
    if (this.collected) return;
    const t = performance.now() / 1000 + this.phase;
    this.model.position.y = 0.45 + Math.sin(t * 2) * 0.08;
    this.model.rotation.y += dt * 1.5;
    this.halo.position.y = this.model.position.y;
    this.halo.quaternion.copy(camera.quaternion);
    if (this.haloDistance > 0) {
      const dist = this.position.distanceTo(playerPos);
      // Au-delà de la portée, le halo s'éteint en douceur
      const k = THREE.MathUtils.clamp((this.haloDistance - dist) / 4, 0, 1);
      this.haloOpacity.value = k;
      this.halo.visible = this.beam.visible = k > 0.01;
      // La colonne n'est utile que de loin
      this.beam.visible = this.beam.visible && dist > 4;
    }
  }

  collect(): void {
    this.collected = true;
    this.object.visible = false;
  }
}
