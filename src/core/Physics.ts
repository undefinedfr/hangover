import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Groupes de collision : bit haut = appartenance, bit bas = filtre. */
export const GROUP_WORLD = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const GROUP_VEHICLE = 0x0004;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

let initPromise: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

export class Physics {
  readonly world: RAPIER.World;
  private readonly staticBody: RAPIER.RigidBody;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / 60;
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  /** Boîte statique centrée en (x, y, z), demi-tailles hx/hy/hz, rotation Y optionnelle. */
  addBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setCollisionGroups(groups(GROUP_WORLD, 0xffff));
    if (rotY !== 0) {
      desc.setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });
    }
    return this.world.createCollider(desc, this.staticBody);
  }

  addCylinder(x: number, y: number, z: number, halfHeight: number, radius: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(x, y, z)
      .setCollisionGroups(groups(GROUP_WORLD, 0xffff));
    return this.world.createCollider(desc, this.staticBody);
  }

  step(): void {
    this.world.step();
  }

  /** Lancer de rayon ; renvoie la distance du premier impact ou null. */
  raycast(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxDist: number,
    filterGroups = groups(0xffff, GROUP_WORLD),
  ): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, filterGroups);
    return hit ? hit.timeOfImpact : null;
  }

  /** Vrai si une capsule verticale posée à cette position chevauche le décor. */
  capsuleBlocked(x: number, y: number, z: number, halfHeight: number, radius: number): boolean {
    const shape = new RAPIER.Capsule(halfHeight, radius);
    let hit = false;
    this.world.intersectionsWithShape(
      { x, y, z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(0xffff, GROUP_WORLD),
    );
    return hit;
  }

  dispose(): void {
    this.world.free();
  }
}
