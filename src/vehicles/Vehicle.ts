import * as THREE from 'three/webgpu';
import { Physics, RAPIER, GROUP_VEHICLE, GROUP_WORLD, GROUP_PLAYER, groups } from '../core/Physics';

export type VehicleName = 'voiture' | 'trottinette' | 'tricycle';

export interface VehicleSpec {
  name: VehicleName;
  label: string;
  /** Demi-dimensions du collider (x : largeur, y : hauteur, z : longueur). */
  half: [number, number, number];
  maxSpeed: number;
  reverseSpeed: number;
  accel: number;
  brake: number;
  steer: number;
  /** Position des pieds du joueur par rapport à l'origine du véhicule. */
  seat: [number, number, number];
  pose: 'hidden' | 'ride' | 'pedal';
  cameraDistance: number;
}

const GRAVITY = 20;

/** Véhicule arcade : corps cinématique Rapier + KinematicCharacterController. */
export abstract class Vehicle {
  readonly object = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  readonly position = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  private vy = 0;
  grounded = true;
  driven = false;
  /** Sur un sol type moquette (sons étouffés). */
  onCarpet = false;
  private readonly shape: RAPIER.Shape;

  constructor(
    readonly spec: VehicleSpec,
    protected readonly physics: Physics,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ) {
    const [hx, hy, hz] = spec.half;
    const r = Math.min(0.1, hy * 0.5);
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const desc = RAPIER.ColliderDesc.roundCuboid(hx - r, hy - r, hz - r, r).setCollisionGroups(
      groups(GROUP_VEHICLE, GROUP_WORLD | GROUP_VEHICLE | GROUP_PLAYER),
    );
    this.collider = physics.world.createCollider(desc, this.body);
    this.shape = new RAPIER.RoundCuboid(hx - r, hy - r, hz - r, r);
    this.controller = physics.world.createCharacterController(0.03);
    this.controller.enableAutostep(0.32, 0.2, false);
    this.controller.enableSnapToGround(0.4);
    this.controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.controller.setSlideEnabled(true);
    this.place(x, y, z, yaw);
  }

  get name(): VehicleName {
    return this.spec.name;
  }

  /** Place l'origine du véhicule (au sol) en (x, y, z). */
  place(x: number, y: number, z: number, yaw: number): void {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.speed = 0;
    this.vy = 0;
    const t = { x, y: y + this.spec.half[1] + 0.02, z };
    const q = this.quat(yaw);
    this.body.setTranslation(t, true);
    this.body.setRotation(q, true);
    this.body.setNextKinematicTranslation(t);
    this.body.setNextKinematicRotation(q);
    this.syncObject();
  }

  private quat(yaw: number): RAPIER.Rotation {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Vrai si le véhicule, tourné de `yaw`, chevaucherait le décor. */
  private blockedAt(yaw: number): boolean {
    const p = this.body.translation();
    let hit = false;
    this.physics.world.intersectionsWithShape(
      p,
      this.quat(yaw),
      this.shape,
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(0xffff, GROUP_WORLD | GROUP_VEHICLE),
      this.collider,
    );
    return hit;
  }

  /** throttle ∈ [-1, 1], steer ∈ [-1, 1] (positif = gauche), pas fixe. */
  drive(dt: number, throttle: number, steer: number, handbrake: boolean): void {
    const s = this.spec;
    if (throttle > 0) {
      this.speed += (this.speed < 0 ? s.brake : s.accel) * throttle * dt;
    } else if (throttle < 0) {
      this.speed += (this.speed > 0 ? s.brake : s.accel * 0.7) * throttle * dt;
    } else {
      // Frottements
      const drag = 3 * dt;
      this.speed = Math.abs(this.speed) < drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (handbrake) {
      const b = s.brake * 1.5 * dt;
      this.speed = Math.abs(this.speed) < b ? 0 : this.speed - Math.sign(this.speed) * b;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -s.reverseSpeed, s.maxSpeed);

    // Direction : l'efficacité dépend de la vitesse (pas de rotation à l'arrêt)
    const k = THREE.MathUtils.clamp(this.speed / 5, -1, 1);
    const newYaw = this.yaw + steer * s.steer * k * dt;
    if (newYaw !== this.yaw && !this.blockedAt(newYaw)) this.yaw = newYaw;
    this.integrate(dt);
  }

  /** Véhicule à l'arrêt, non conduit : juste la gravité. */
  idle(dt: number): void {
    this.speed = 0;
    this.integrate(dt);
  }

  private integrate(dt: number): void {
    if (this.grounded) this.vy = -1;
    else this.vy -= GRAVITY * dt;
    const f = this.forward();
    const desired = { x: f.x * this.speed * dt, y: this.vy * dt, z: f.z * this.speed * dt };
    this.body.setRotation(this.quat(this.yaw), true);
    this.controller.computeColliderMovement(
      this.collider,
      desired,
      undefined,
      groups(0xffff, GROUP_WORLD | GROUP_VEHICLE),
    );
    const mv = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const wanted = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(mv.x, mv.z);
    // Choc contre un mur : on perd la vitesse
    if (wanted > 1e-4 && got < wanted * 0.5) this.speed *= 0.5;
    const p = this.body.translation();
    const next = { x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z };
    this.body.setNextKinematicTranslation(next);
    this.body.setNextKinematicRotation(this.quat(this.yaw));
    this.position.set(next.x, next.y - this.spec.half[1] - 0.02, next.z);
    if (this.position.y < -5) this.place(this.position.x, 1, this.position.z, this.yaw);
  }

  /** Mise à jour visuelle (roues, pédales…), à chaque image. */
  animate(dt: number): void {
    this.syncObject();
    this.animateParts(dt);
  }

  protected abstract animateParts(dt: number): void;

  private syncObject(): void {
    this.object.position.copy(this.position);
    this.object.rotation.y = this.yaw;
  }

  /** Position des pieds du joueur assis / debout sur le véhicule. */
  seatPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const [sx, sy, sz] = this.spec.seat;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(this.position.x + sx * c + sz * s, this.position.y + sy, this.position.z - sx * s + sz * c);
  }

  /** Points de descente candidats (côtés, arrière, avant), du plus au moins naturel. */
  exitCandidates(): THREE.Vector3[] {
    const [hx, , hz] = this.spec.half;
    const f = this.forward();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const out: THREE.Vector3[] = [];
    for (const m of [0.9, 1.6]) {
      out.push(this.position.clone().addScaledVector(right, -(hx + 0.5 * m)));
      out.push(this.position.clone().addScaledVector(right, hx + 0.5 * m));
      out.push(this.position.clone().addScaledVector(f, -(hz + 0.6 * m)));
      out.push(this.position.clone().addScaledVector(f, hz + 0.6 * m));
    }
    return out;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
  }
}
