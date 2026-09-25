import * as THREE from 'three/webgpu';
import { itemGeometry } from '../items/models';
import { vertexColorMaterial } from '../world/materials';
import { Physics, RAPIER, GROUP_PLAYER, GROUP_WORLD, GROUP_VEHICLE, groups } from '../core/Physics';

export const WALK_SPEED = 4;
export const RUN_SPEED = 6.5;
const JUMP_SPEED = 7.2;
const GRAVITY = 20;
const HALF_HEIGHT = 0.5;
const RADIUS = 0.35;
/** Hauteur du centre de la capsule au-dessus des pieds. */
export const PLAYER_CENTER = HALF_HEIGHT + RADIUS;

type Pose = 'walk' | 'ride' | 'pedal' | 'hidden';

/** Personnage : capsule Rapier + silhouette low poly animée procéduralement. */
export class Player {
  readonly object = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;

  private readonly torso: THREE.Group;
  private readonly head: THREE.Mesh;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly glasses: THREE.Mesh;

  readonly position = new THREE.Vector3();
  facing = 0;
  private vy = 0;
  grounded = false;
  /** Vitesse horizontale effective (m/s), pour l'animation et les sons. */
  speed = 0;
  private phase = 0;
  private swayTime = 0;
  swayIntensity = 0.5;
  private readonly swaySeed: number;
  pose: Pose = 'walk';
  /** Pédalage (tricycle) : vitesse de rotation des jambes. */
  pedalSpeed = 0;
  /** Appelé à chaque pas (pour le son). */
  onStep: (() => void) | null = null;

  constructor(private readonly physics: Physics, swaySeed: number) {
    this.swaySeed = swaySeed;
    const skin = new THREE.MeshStandardNodeMaterial({ color: 0xf2c29b, roughness: 0.8 });
    const shirt = new THREE.MeshStandardNodeMaterial({ color: 0xff6f59, roughness: 0.85 });
    const pants = new THREE.MeshStandardNodeMaterial({ color: 0x3b5b92, roughness: 0.9 });
    const tie = new THREE.MeshStandardNodeMaterial({ color: 0x5dd39e, roughness: 0.6 });
    const dark = new THREE.MeshStandardNodeMaterial({ color: 0x2b2b3a, roughness: 0.9 });

    const cast = (m: THREE.Mesh) => {
      m.castShadow = true;
      return m;
    };

    this.torso = new THREE.Group();
    this.torso.position.y = 0.95;
    const chest = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.35, 4, 8), shirt));
    chest.position.y = 0.2;
    this.torso.add(chest);
    this.head = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), skin));
    this.head.position.y = 0.72;
    this.torso.add(this.head);
    // Cravate nouée autour de la tête : souvenir de la soirée
    const band = cast(new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.035, 5, 14), tie));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.06;
    this.head.add(band);
    const knot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.09), tie));
    knot.position.set(0, -0.02, -0.24);
    knot.rotation.x = -0.5;
    this.head.add(knot);
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4);
    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(eyeGeo, dark);
      eye.position.set(sx, 0.03, 0.2);
      eye.scale.y = 0.45; // yeux mi-clos
      this.head.add(eye);
    }

    this.glasses = new THREE.Mesh(itemGeometry('lunettes'), vertexColorMaterial({ flat: false }));
    this.glasses.scale.setScalar(0.85);
    this.glasses.position.set(0, 0.03, 0.2);
    this.glasses.visible = false;
    this.head.add(this.glasses);

    const limb = (len: number, r: number, mat: THREE.Material) => {
      const g = new THREE.Group();
      const m = cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), mat));
      m.position.y = -len / 2 - r * 0.5;
      g.add(m);
      return g;
    };
    this.armL = limb(0.45, 0.075, shirt);
    this.armL.position.set(-0.34, 0.42, 0);
    this.armR = limb(0.45, 0.075, shirt);
    this.armR.position.set(0.34, 0.42, 0);
    this.torso.add(this.armL, this.armR);
    this.legL = limb(0.55, 0.1, pants);
    this.legL.position.set(-0.13, 0.74, 0);
    this.legR = limb(0.55, 0.1, pants);
    this.legR.position.set(0.13, 0.74, 0);
    this.object.add(this.torso, this.legL, this.legR);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0);
    this.body = physics.world.createRigidBody(bodyDesc);
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setCollisionGroups(
        groups(GROUP_PLAYER, GROUP_WORLD | GROUP_VEHICLE),
      ),
      this.body,
    );
    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.35, 0.15, false);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setSlideEnabled(true);
  }

  wearGlasses(): void {
    this.glasses.visible = true;
  }

  /** Téléporte les pieds du joueur en (x, y, z). */
  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.body.setTranslation({ x, y: y + PLAYER_CENTER, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + PLAYER_CENTER, z });
    this.vy = 0;
    this.syncObject();
  }

  setActive(active: boolean): void {
    this.collider.setEnabled(active);
  }

  /**
   * Déplacement à pied (pas fixe). `moveX/moveZ` : direction voulue dans le monde (longueur ≤ 1).
   */
  update(dt: number, moveX: number, moveZ: number, run: boolean, jump: boolean): void {
    const len = Math.hypot(moveX, moveZ);
    const target = len > 0.01 ? (run ? RUN_SPEED : WALK_SPEED) : 0;
    let vx = moveX * target;
    let vz = moveZ * target;

    // Titubement : dérive latérale pseudo-aléatoire, proportionnelle à la vitesse
    this.swayTime += dt;
    if (len > 0.01) {
      const t = this.swayTime + this.swaySeed;
      const n = Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1.7) * 0.3 + Math.sin(t * 0.47 + 4.1) * 0.5;
      const side = n * this.swayIntensity * 0.45;
      vx += (-moveZ / len) * side * target;
      vz += (moveX / len) * side * target;
    }

    if (this.grounded) {
      this.vy = -1;
      if (jump) this.vy = JUMP_SPEED;
    } else {
      this.vy -= GRAVITY * dt;
    }

    const desired = { x: vx * dt, y: this.vy * dt, z: vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, undefined, groups(0xffff, GROUP_WORLD | GROUP_VEHICLE));
    const mv = this.controller.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.vy > 0 && !wasGrounded) this.vy = 0;
    if (!this.grounded && mv.y > desired.y + 1e-4 && this.vy > 0) this.vy = 0; // plafond

    const p = this.body.translation();
    const nx = p.x + mv.x;
    const ny = p.y + mv.y;
    const nz = p.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.speed = Math.hypot(mv.x, mv.z) / dt;
    this.position.set(nx, ny - PLAYER_CENTER, nz);

    // Sécurité : jamais sous le sol
    if (this.position.y < -5) this.teleport(this.position.x, 2, this.position.z);

    if (len > 0.01) {
      const targetYaw = Math.atan2(vx, vz);
      let d = targetYaw - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    }
  }

  /** Animation procédurale, appelée à chaque image. */
  animate(dt: number): void {
    this.syncObject();
    const t = performance.now() / 1000;
    if (this.pose === 'hidden') {
      this.object.visible = false;
      return;
    }
    this.object.visible = true;

    if (this.pose === 'walk') {
      const moving = Math.min(1, this.speed / WALK_SPEED);
      const prev = this.phase;
      this.phase += dt * (4 + this.speed * 1.6) * (moving > 0.05 ? 1 : 0);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && this.grounded) this.onStep?.();
      const amp = 0.75 * moving;
      const s = Math.sin(this.phase);
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      this.armL.rotation.set(-s * amp * 0.8, 0, -0.08);
      this.armR.rotation.set(s * amp * 0.8, 0, 0.08);
      this.torso.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * 0.06 * moving;
      // Léger roulis de gueule de bois
      const wobble = Math.sin(t * 1.7) * 0.05 + Math.sin(t * 0.9 + 1) * 0.04;
      this.torso.rotation.z = wobble * this.swayIntensity;
      this.torso.rotation.x = moving * 0.12;
      if (!this.grounded) {
        this.legL.rotation.x = -0.5;
        this.legR.rotation.x = 0.3;
        this.armL.rotation.set(-2.6, 0, -0.3);
        this.armR.rotation.set(-2.6, 0, 0.3);
      }
    } else if (this.pose === 'ride') {
      // Debout sur la trottinette, mains sur le guidon
      this.legL.rotation.x = 0.1;
      this.legR.rotation.x = -0.25;
      this.armL.rotation.set(-1.2, 0, 0.2);
      this.armR.rotation.set(-1.2, 0, -0.2);
      this.torso.position.y = 0.95;
      this.torso.rotation.set(0.1, 0, Math.sin(t * 1.3) * 0.04);
    } else if (this.pose === 'pedal') {
      this.phase += dt * this.pedalSpeed;
      const s = Math.sin(this.phase);
      this.legL.rotation.x = -1.2 + s * 0.45;
      this.legR.rotation.x = -1.2 - s * 0.45;
      this.armL.rotation.set(-1.1, 0, 0.15);
      this.armR.rotation.set(-1.1, 0, -0.15);
      this.torso.position.y = 0.95;
      this.torso.rotation.set(0.15, 0, 0);
    }
  }

  private syncObject(): void {
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}
