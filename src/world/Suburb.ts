import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  fwidth,
  hash,
  max,
  mix,
  positionWorld,
  select,
  smoothstep,
  step,
  uv,
  vertexColor,
  normalWorld,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { part, merge } from './Batch';
import type { RNG } from '../core/rng';

const box = new THREE.BoxGeometry(1, 1, 1);

/** Anti-crénelage : 1 de près, 0 quand le motif devient plus fin qu'un pixel. */
function detail(coord: Node<'float'>, scale = 1): Node<'float'> {
  return float(1).sub(smoothstep(0.25, 0.9, fwidth(coord).mul(scale)));
}

/** Coordonnée horizontale le long d'une façade alignée sur les axes. */
function alongWall(): Node<'float'> {
  const wp = positionWorld;
  return select(abs(normalWorld.x).greaterThan(0.5), wp.z, wp.x);
}

/** Bardage à clin : planches horizontales avec ligne d'ombre. */
function sidingMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 });
  const y = positionWorld.y.div(0.21);
  const board = fract(y);
  const shade = mix(float(0.78), float(1), smoothstep(0.0, 0.22, board)).mul(detail(y)).add(float(1).sub(detail(y)).mul(0.93));
  const roofish = step(0.5, abs(normalWorld.y));
  mat.colorNode = vertexColor().mul(mix(shade, float(1), roofish));
  return mat;
}

/** Brique en appareil courant, joints clairs, nuances par brique. */
function brickMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9 });
  const row = floor(positionWorld.y.div(0.085));
  const u = alongWall().div(0.24).add(row.mul(0.5));
  const jx = abs(fract(u).sub(0.5));
  const jy = abs(fract(positionWorld.y.div(0.085)).sub(0.5));
  const joint = max(smoothstep(0.44, 0.5, jx), smoothstep(0.36, 0.5, jy)).mul(detail(positionWorld.y.div(0.085), 1.2));
  const tint = hash(floor(u).add(row.mul(37.1))).sub(0.5).mul(0.22).add(1);
  mat.colorNode = mix(vertexColor().mul(tint), vec3(0.78, 0.74, 0.68), joint.mul(0.85));
  return mat;
}

/** Bardeaux d'asphalte : rangées décalées, nuances par tuile. */
function shingleMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 });
  const wp = positionWorld;
  const r = wp.y.div(0.16);
  const row = floor(r);
  const u = wp.x.add(wp.z).div(0.34).add(row.mul(0.5));
  const lineY = smoothstep(0.8, 1.0, fract(r)).mul(detail(r));
  const lineX = smoothstep(0.46, 0.5, abs(fract(u).sub(0.5))).mul(detail(u)).mul(0.6);
  const tint = hash(floor(u).add(row.mul(91.7))).sub(0.5).mul(0.25).add(1);
  mat.colorNode = vertexColor().mul(tint).mul(float(1).sub(max(lineY, lineX).mul(0.35)));
  return mat;
}

/** Béton des allées : joints de dilatation, légère usure. */
export function concreteMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
  const wp = positionWorld;
  const jx = abs(fract(wp.x.div(1.6)).sub(0.5));
  const jz = abs(fract(wp.z.div(1.6)).sub(0.5));
  const joint = smoothstep(0.47, 0.5, max(jx, jz)).mul(detail(wp.x, 1.5));
  const tint = hash(floor(wp.x.div(1.6)).add(floor(wp.z.div(1.6)).mul(57))).sub(0.5).mul(0.06).add(1);
  const base = vec3(0.74, 0.73, 0.7).mul(tint);
  mat.colorNode = mix(base, base.mul(0.72), joint);
  return mat;
}

/** Palissade en bois grisé : planches verticales. */
function woodFenceMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 });
  const u = alongWall().div(0.14);
  const gap = smoothstep(0.42, 0.5, abs(fract(u).sub(0.5))).mul(detail(u));
  const tint = hash(floor(u)).sub(0.5).mul(0.18).add(1);
  mat.colorNode = vertexColor().mul(tint).mul(float(1).sub(gap.mul(0.5)));
  return mat;
}

/** Clôture à piquets blancs : piquets pointus découpés en alpha. */
function picketMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0xf2f1ea, roughness: 0.7, side: THREE.DoubleSide });
  const u = uv();
  const cx = abs(fract(u.x.div(0.16)).sub(0.5));
  const pointy = u.y.lessThan(float(0.86).add(float(0.14).mul(float(1).sub(cx.mul(4)))));
  const picket = step(cx, 0.3).mul(select(pointy, float(1), float(0)));
  const rails = step(0.25, u.y).mul(step(u.y, 0.33)).add(step(0.65, u.y).mul(step(u.y, 0.73)));
  const far = smoothstep(0.3, 0.9, fwidth(u.x.div(0.16)));
  mat.opacityNode = mix(picket.add(rails).clamp(0, 1), float(0.55), far);
  mat.alphaTest = 0.4;
  mat.alphaToCoverage = true;
  return mat;
}

/** Pose un polygone plein et retourne ses triangles orientés vers l'extérieur. */
function oriented(tris: number[][], center: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Vector3();
  for (const t of tris) {
    a.fromArray(t, 0);
    b.fromArray(t, 3);
    c.fromArray(t, 6);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    const centroid = a.clone().add(b).add(c).divideScalar(3).sub(center);
    if (n.dot(centroid) < 0) pos.push(...a.toArray(), ...c.toArray(), ...b.toArray());
    else pos.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function transform(g: THREE.BufferGeometry, x: number, y: number, z: number, rot: number): THREE.BufferGeometry {
  return g.applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1)),
  );
}

export const SIDING = [0xefeee8, 0xe9ddb0, 0xb3c8da, 0xbccaa9, 0xc2c4c0, 0xdccdb2, 0xe8c8b8];
export const BRICK = [0x9a5a44, 0x8c4d3b, 0xa76c52, 0x9b6a5a];
const ROOF = [0x4c5058, 0x5c4d44, 0x6d7075, 0x44504a, 0x5a3f38];
const DOOR = [0x8e2f2f, 0x2c3e5a, 0x2f5040, 0x24272c, 0x6b4a2e];
const SHUTTER = [0x2f4f3c, 0x2c3e5a, 0x1f2227, 0x6b2a2a];
const TRIM = 0xf4f2ec;

export interface HouseSpec {
  /** Centre du corps principal, au sol. */
  x: number;
  z: number;
  base: number;
  /** Rotation : la façade avant regarde vers +z local. */
  rot: number;
  w: number;
  d: number;
  stories: 1 | 2;
  brick: boolean;
  wall: number;
  roof: number;
  door: number;
  shutters: number | null;
  garage: -1 | 0 | 1;
}

type Chunk = {
  siding: THREE.BufferGeometry[];
  brick: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  fence: THREE.BufferGeometry[];
  picket: THREE.BufferGeometry[];
};

/** Accumule le quartier pavillonnaire en maillages fusionnés, par tuiles de 64 m. */
export class SuburbBuilder {
  private readonly chunks = new Map<string, Chunk>();
  private c!: Chunk;
  readonly wires: number[] = [];

  constructor(private readonly rng: RNG, private readonly chunkSize = 64) {}

  private select(x: number, z: number): void {
    const key = `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { siding: [], brick: [], roof: [], trim: [], fence: [], picket: [] };
      this.chunks.set(key, c);
    }
    this.c = c;
  }

  /** Pièce en coordonnées locales de la maison (façade vers +z). */
  private local(list: THREE.BufferGeometry[], g: THREE.BufferGeometry, s: HouseSpec): void {
    list.push(transform(g, s.x, s.base, s.z, s.rot));
  }

  /** Pavillon : corps, toit à deux pans, fenêtres, porche, garage accolé. Renvoie les emprises. */
  addHouse(s: HouseSpec): Array<{ x: number; z: number; hw: number; hd: number; h: number }> {
    this.select(s.x, s.z);
    const rng = this.rng;
    const wallList = s.brick ? this.c.brick : this.c.siding;
    const h = s.stories === 2 ? 5.7 : 3.0;
    const { w, d } = s;
    const colliders: Array<{ x: number; z: number; hw: number; hd: number; h: number }> = [];
    const world = (lx: number, lz: number) => ({
      x: s.x + lx * Math.cos(s.rot) + lz * Math.sin(s.rot),
      z: s.z - lx * Math.sin(s.rot) + lz * Math.cos(s.rot),
    });
    const flip = Math.abs(Math.sin(s.rot)) > 0.5;

    // Corps + soubassement
    this.local(wallList, part(box, s.wall, [0, h / 2, 0], [0, 0, 0], [w, h, d]), s);
    this.local(this.c.trim, part(box, 0x8d8a84, [0, 0.2, 0], [0, 0, 0], [w + 0.06, 0.4, d + 0.06]), s);
    const c0 = world(0, 0);
    colliders.push({ x: c0.x, z: c0.z, hw: (flip ? d : w) / 2, hd: (flip ? w : d) / 2, h });

    // Toit à deux pans (faîtage parallèle à la rue) + pignons
    this.addGable(s, 0, 0, w, d, h, 2.1, s.wall, wallList);

    // Fenêtres
    const win = (lx: number, ly: number, lz: number, rotY: number, ww = 0.95, wh = 1.3) => {
      const g = merge([
        part(box, TRIM, [0, 0, 0], [0, 0, 0], [ww + 0.2, wh + 0.2, 0.08]),
        part(box, 0x2e3a48, [0, 0, 0.03], [0, 0, 0], [ww, wh, 0.04]),
        part(box, TRIM, [0, 0, 0.06], [0, 0, 0], [0.05, wh, 0.03]),
        part(box, TRIM, [0, wh * 0.1, 0.06], [0, 0, 0], [ww, 0.05, 0.03]),
        part(box, TRIM, [0, -wh / 2 - 0.12, 0.05], [0, 0, 0], [ww + 0.35, 0.06, 0.14]),
        ...(s.shutters !== null
          ? [-1, 1].map((k) => part(box, s.shutters!, [k * (ww / 2 + 0.26), 0, 0.02], [0, 0, 0], [0.36, wh + 0.1, 0.05]))
          : []),
      ]);
      g.rotateY(rotY);
      g.translate(lx, ly, lz);
      this.local(this.c.trim, g, s);
    };
    const floors = s.stories === 2 ? [1.55, 4.3] : [1.55];
    const doorX = s.garage === 1 ? -w * 0.18 : w * 0.18;
    for (const fy of floors) {
      const cols = [-w * 0.34, 0, w * 0.34];
      for (const cx of cols) {
        if (fy < 2 && Math.abs(cx - doorX) < 1.1) continue;
        win(cx, fy, d / 2 + 0.02, 0);
      }
      win(-w * 0.2, fy, -d / 2 - 0.02, Math.PI, 0.9, 1.1);
      win(w * 0.25, fy, -d / 2 - 0.02, Math.PI);
      win(w / 2 + 0.02, fy, 0, Math.PI / 2, 0.9, 1.2);
      win(-w / 2 - 0.02, fy, 0, -Math.PI / 2, 0.9, 1.2);
    }

    // Porte, porche (dalle, poteaux, auvent) et marche
    const door = merge([
      part(box, TRIM, [doorX, 1.1, d / 2 + 0.03], [0, 0, 0], [1.15, 2.3, 0.08]),
      part(box, s.door, [doorX, 1.07, d / 2 + 0.07], [0, 0, 0], [0.95, 2.1, 0.05]),
      part(new THREE.SphereGeometry(0.05, 8, 6), 0xc9a54a, [doorX + 0.36, 1.05, d / 2 + 0.12]),
    ]);
    this.local(this.c.trim, door, s);
    const porchW = 2.8;
    const porchD = 1.8;
    this.local(this.c.trim, part(box, 0xb9b4aa, [doorX, 0.15, d / 2 + porchD / 2], [0, 0, 0], [porchW, 0.3, porchD]), s);
    for (const k of [-1, 1]) {
      this.local(this.c.trim, part(box, TRIM, [doorX + k * (porchW / 2 - 0.15), 1.45, d / 2 + porchD - 0.15], [0, 0, 0], [0.14, 2.3, 0.14]), s);
    }
    const awning = part(box, s.roof, [doorX, 2.72, d / 2 + porchD / 2], [0.2, 0, 0], [porchW + 0.4, 0.08, porchD + 0.5]);
    this.local(this.c.roof, awning, s);
    this.local(this.c.trim, part(box, TRIM, [doorX, 2.62, d / 2 + porchD - 0.1], [0, 0, 0], [porchW + 0.2, 0.18, 0.12]), s);

    // Cheminée en brique sur un pignon
    const chx = (rng.chance(0.5) ? 1 : -1) * (w / 2 - 0.5);
    this.local(this.c.brick, part(box, 0x8c4d3b, [chx, h + 1.4, -d * 0.1], [0, 0, 0], [0.7, 3.0, 0.8]), s);
    this.local(this.c.trim, part(box, 0x6f6a64, [chx, h + 2.95, -d * 0.1], [0, 0, 0], [0.82, 0.12, 0.92]), s);

    // Garage accolé : volume plus bas, porte sectionnelle, toit à deux pans
    if (s.garage !== 0) {
      const gw = 3.6;
      const gd = d - 1.2;
      const gx = s.garage * (w / 2 + gw / 2);
      const gz = d / 2 - gd / 2;
      const gh = 2.8;
      this.local(wallList, part(box, s.wall, [gx, gh / 2, gz], [0, 0, 0], [gw, gh, gd]), s);
      this.local(this.c.trim, part(box, 0x8d8a84, [gx, 0.2, gz], [0, 0, 0], [gw + 0.06, 0.4, gd + 0.06]), s);
      const gdoor: THREE.BufferGeometry[] = [part(box, TRIM, [gx, 1.1, d / 2 + 0.02], [0, 0, 0], [2.8, 2.2, 0.06])];
      for (let k = 0; k < 4; k++) gdoor.push(part(box, 0xd6d4cc, [gx, 0.3 + k * 0.52, d / 2 + 0.055], [0, 0, 0], [2.7, 0.04, 0.02]));
      this.local(this.c.trim, merge(gdoor), s);
      this.addGable(s, gx, gz, gw, gd, gh, 1.3, s.wall, wallList);
      const gc = world(gx, gz);
      colliders.push({ x: gc.x, z: gc.z, hw: (flip ? gd : gw) / 2, hd: (flip ? gw : gd) / 2, h: gh });
    }
    return colliders;
  }

  /** Toit à deux pans : deux versants (bardeaux) + deux pignons (matériau du mur). */
  private addGable(s: HouseSpec, cx: number, cz: number, w: number, d: number, h: number, pitch: number, wall: number, wallList: THREE.BufferGeometry[]): void {
    const o = 0.35;
    const x0 = cx - w / 2 - o;
    const x1 = cx + w / 2 + o;
    const zf = cz + d / 2 + o;
    const zb = cz - d / 2 - o;
    const eave = h - (o * pitch) / (d / 2);
    const top = h + pitch;
    const center = new THREE.Vector3(cx, h, cz);
    const slopes = oriented(
      [
        [x0, eave, zf, x1, eave, zf, x1, top, cz],
        [x0, eave, zf, x1, top, cz, x0, top, cz],
        [x0, eave, zb, x1, top, cz, x1, eave, zb],
        [x0, eave, zb, x0, top, cz, x1, top, cz],
      ],
      center,
    );
    // Épaisseur de la rive : léger débord sous le toit
    const under = oriented(
      [
        [x0, eave - 0.12, zf, x1, eave - 0.12, zf, x1, top - 0.12, cz],
        [x0, eave - 0.12, zf, x1, top - 0.12, cz, x0, top - 0.12, cz],
        [x0, eave - 0.12, zb, x1, top - 0.12, cz, x1, eave - 0.12, zb],
        [x0, eave - 0.12, zb, x0, top - 0.12, cz, x1, top - 0.12, cz],
      ],
      new THREE.Vector3(cx, h + 5, cz),
    );
    this.local(this.c.roof, part(slopes, s.roof), s);
    this.local(this.c.trim, part(under, TRIM), s);
    const gables = oriented(
      [
        [cx - w / 2, h, cz + d / 2, cx - w / 2, h, cz - d / 2, cx - w / 2, top - 0.05, cz],
        [cx + w / 2, h, cz + d / 2, cx + w / 2, h, cz - d / 2, cx + w / 2, top - 0.05, cz],
      ],
      new THREE.Vector3(cx, h, cz),
    );
    this.local(wallList, part(gables, wall), s);
  }

  /** Palissade en bois (segment droit au sol). */
  addFence(x0: number, z0: number, x1: number, z1: number, base: number, h = 1.8): void {
    this.select((x0 + x1) / 2, (z0 + z1) / 2);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    const g = merge([
      part(box, 0x8f8576, [0, h / 2, 0], [0, 0, 0], [len, h, 0.06]),
      part(box, 0x7a7063, [0, h - 0.05, 0.06], [0, 0, 0], [len, 0.1, 0.06]),
      ...Array.from({ length: Math.max(2, Math.round(len / 2.4) + 1) }, (_, k) =>
        part(box, 0x7a7063, [-len / 2 + (k * len) / Math.max(1, Math.round(len / 2.4)), h / 2, 0.04], [0, 0, 0], [0.1, h, 0.1]),
      ),
    ]);
    this.c.fence.push(transform(g, (x0 + x1) / 2, base, (z0 + z1) / 2, rot));
  }

  /** Clôture à piquets blancs. */
  addPicket(x0: number, z0: number, x1: number, z1: number, base: number): void {
    this.select((x0 + x1) / 2, (z0 + z1) / 2);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    const g = new THREE.PlaneGeometry(len, 0.95);
    const uvA = g.getAttribute('uv');
    for (let i = 0; i < uvA.count; i++) uvA.setX(i, uvA.getX(i) * len);
    g.translate(0, 0.475, 0);
    this.c.picket.push(transform(part(g, 0xffffff, [0, 0, 0], [0, 0, 0], [1, 1, 1], true), (x0 + x1) / 2, base, (z0 + z1) / 2, rot));
  }

  /** Accessoire générique en couleurs de sommet (boîte aux lettres, poteau…) déjà transformé. */
  addTrim(g: THREE.BufferGeometry, x: number, z: number): void {
    this.select(x, z);
    this.c.trim.push(g);
  }

  /** Fils électriques entre deux poteaux (flèche parabolique). */
  addWire(a: THREE.Vector3, b: THREE.Vector3, sag = 0.7, segs = 8): void {
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs;
      const t1 = (k + 1) / segs;
      const p0 = a.clone().lerp(b, t0);
      const p1 = a.clone().lerp(b, t1);
      p0.y -= sag * 4 * t0 * (1 - t0);
      p1.y -= sag * 4 * t1 * (1 - t1);
      this.wires.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const mats = {
      siding: sidingMaterial(),
      brick: brickMaterial(),
      roof: shingleMaterial(),
      trim: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6 }),
      fence: woodFenceMaterial(),
      picket: picketMaterial(),
    };
    for (const c of this.chunks.values()) {
      for (const key of Object.keys(mats) as Array<keyof typeof mats>) {
        const list = c[key];
        if (!list.length) continue;
        const m = new THREE.Mesh(merge(list), mats[key]);
        m.castShadow = key !== 'picket';
        m.receiveShadow = true;
        out.push(m);
      }
    }
    if (this.wires.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
      out.push(new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ color: 0x1c1c20 })));
    }
    return out;
  }
}

export function pickHouseColors(rng: RNG): { brick: boolean; wall: number; roof: number; door: number; shutters: number | null } {
  const brick = rng.chance(0.3);
  return {
    brick,
    wall: brick ? rng.pick(BRICK) : rng.pick(SIDING),
    roof: rng.pick(ROOF),
    door: rng.pick(DOOR),
    shutters: rng.chance(0.5) ? rng.pick(SHUTTER) : null,
  };
}
