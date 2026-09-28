import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { RNG } from '../core/rng';
import { InstanceBatch } from './Batch';
import {
  plainMaterial,
  vertexColorMaterial,
  asphaltMaterial,
  lawnMaterial,
} from './materials';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { facadeMaterial, GROUND_FLOOR, TOP_BAND, FLOOR_H } from './Facade';
import { ArchitectureBuilder } from './Architecture';
import {
  benchGeometry,
  bushGeometry,
  carGeometry,
  hydrantGeometry,
  leafCrownGeometry,
  leafyTrunkGeometry,
  mailboxGeometry,
  poleGeometry,
  wheelieBinGeometry,
} from './props';
import { leafMaterial } from './materials';
import { SuburbBuilder, concreteMaterial, pickHouseColors, type HouseSpec } from './Suburb';

import { PITCH, HALF, INNER, ROAD, SLAB_H } from './constants';
export { PITCH, HALF, INNER, ROAD, SLAB_H };
/** Bande d'herbe entre bordure et trottoir (arbres, poteaux, boîtes aux lettres). */
const PROP_LINE = 17.3;
const STRIP_IN = 16.6;
const WALK_LINE = 15.8;
const PARK_LINE = 19.4;

export type BlockType = 'buildings' | 'park' | 'parking' | 'residential' | 'cinema' | 'house' | 'start';
export type SpotKind = 'open' | 'behind' | 'nook';

export interface Spot {
  x: number;
  y: number;
  z: number;
  kind: SpotKind;
  label: string;
}

export interface Block {
  i: number;
  j: number;
  x: number;
  z: number;
  type: BlockType;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface City {
  n: number;
  extent: number;
  blocks: Block[];
  root: THREE.Group;
  spots: Spot[];
  start: Placement;
  house: { door: Placement; front: { x: number; z: number }; block: Block };
  carSpawn: Placement;
  scooterSpawn: Placement;
  tricycleSpawn: Placement;
  carpets: Rect[];
  /** Emprises des bâtiments (pour la mini-carte). */
  footprints: Rect[];
}

/** Briques de la rue commerçante. */
const BRICKS = [0x9a5a44, 0x8c4d3b, 0xa76c52, 0x7e4a3c, 0xb07a5e];
/** Devantures. */
const ACCENT = [0x2f5d50, 0x7a2e3a, 0x28406b, 0x3a3d48, 0x9c6a2a, 0x557a95, 0x40634a];
const CAR_PAINTS = [0xd9d7d0, 0x9fb6c9, 0x46695a, 0xa83a34, 0x6f747a, 0xc9a24a, 0x2d3646, 0xf1f0ea, 0x7a5040, 0x23262b];
const BIN_COLORS = [0x2f5a3c, 0x2a2d31, 0x2d4a78];

interface Side {
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  rot: number; // rotation Y pour que +z local pointe vers l'extérieur
}

const SIDES: Side[] = [
  { nx: 0, nz: 1, tx: -1, tz: 0, rot: 0 },
  { nx: 1, nz: 0, tx: 0, tz: 1, rot: Math.PI / 2 },
  { nx: 0, nz: -1, tx: 1, tz: 0, rot: Math.PI },
  { nx: -1, nz: 0, tx: 0, tz: -1, rot: -Math.PI / 2 },
];

function at(b: { x: number; z: number }, s: Side, d: number, t: number): { x: number; z: number } {
  return { x: b.x + s.nx * d + s.tx * t, z: b.z + s.nz * d + s.tz * t };
}

export function blockCenter(n: number, i: number): number {
  return (i - (n - 1) / 2) * PITCH;
}

export function generateCity(seed: number, n: number, physics: Physics): City {
  const rng = new RNG(seed).fork(0xc17);
  const root = new THREE.Group();
  root.name = 'city';
  const extent = blockCenter(n, n - 1) + HALF + ROAD;

  // --- Matériaux et lots d'instances ---
  const vmat = vertexColorMaterial();
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Géométrie propre aux façades (attributs d'instance dédiés)
  const buildings = new InstanceBatch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plainMaterial(0xffffff));
  const arch = new ArchitectureBuilder(rng.fork(0xa2c));
  const archRng = rng.fork(0x51de);
  const suburb = new SuburbBuilder(rng.fork(0x5b0b));
  const houseRng = rng.fork(0x4053);
  const concrete = concreteMaterial();
  const slabs = new InstanceBatch(unitBox, concrete, { castShadow: false });
  const paths = new InstanceBatch(unitBox, concrete, { castShadow: false });
  const curbs = new InstanceBatch(unitBox, plainMaterial(0xc9c7c1, 0.85), { castShadow: false });
  const grass = new InstanceBatch(unitBox, lawnMaterial(), { castShadow: false });
  const lots = new InstanceBatch(unitBox, asphaltMaterial(), { castShadow: false });
  const stripes = new InstanceBatch(unitBox, plainMaterial(0xf2f0ea, 0.8), { castShadow: false });
  const yellow = new InstanceBatch(unitBox, plainMaterial(0xe0b32e, 0.7), { castShadow: false });
  const benches = new InstanceBatch(benchGeometry(0x8a6a4a, 0x2b2d31), vmat);
  const bins = new InstanceBatch(wheelieBinGeometry(), vmat);
  const trunks = new InstanceBatch(leafyTrunkGeometry(), vmat);
  const leaves = new InstanceBatch(leafCrownGeometry(7), leafMaterial());
  const bushes = new InstanceBatch(bushGeometry(), vmat);
  const hydrants = new InstanceBatch(hydrantGeometry(), vmat);
  const mailboxes = new InstanceBatch(mailboxGeometry(), vmat);
  const polesPlain = new InstanceBatch(poleGeometry(false, false), vmat);
  const polesLight = new InstanceBatch(poleGeometry(true, false), vmat);
  const polesTrans = new InstanceBatch(poleGeometry(false, true), vmat);
  const cars = new InstanceBatch(carGeometry(), vmat);
  const hedges = new InstanceBatch(
    new RoundedBoxGeometry(1, 1, 1, 2, 0.18).translate(0, 0.5, 0),
    plainMaterial(0x46703a, 1),
  );

  const spots: Spot[] = [];
  const parkedCars: Array<{ x: number; z: number }> = [];
  const footprints: Rect[] = [];
  const carpets: Rect[] = [];

  type Street = { px: boolean; nx: boolean; pz: boolean; nz: boolean };
  /** Bâtiment de la rue commerçante (brique). Renvoie sa hauteur. */
  const addBuilding = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    street: Street,
    opts: { floors?: number; wall?: number; accent?: number; decor?: boolean } = {},
  ): number => {
    const floors = opts.floors ?? archRng.int(1, 2);
    const h = GROUND_FLOOR + floors * FLOOR_H + TOP_BAND;
    const wall = new THREE.Color(opts.wall ?? archRng.pick(BRICKS));
    const accent = new THREE.Color(opts.accent ?? archRng.pick(ACCENT));
    buildings.add(cx, SLAB_H, cz, 0, w, h, d, 0xffffff, {
      aSize: [w, h, d],
      aWall: [wall.r, wall.g, wall.b],
      aInfo: [2, archRng.next()],
      aAccent: [accent.r, accent.g, accent.b],
    });
    arch.addBuilding({ x: cx, z: cz, w, d, h, style: 2, street, base: SLAB_H }, wall.getHex());
    if (!opts.decor) {
      physics.addBox(cx, SLAB_H + h / 2, cz, w / 2, h / 2, d / 2);
      footprints.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
    return h;
  };

  // --- Choix des blocs spéciaux ---
  const blocks: Block[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      blocks.push({ i, j, x: blockCenter(n, i), z: blockCenter(n, j), type: 'residential' });
    }
  }
  const mid = (n - 1) / 2;
  const startIdx = (() => {
    const cands = blocks.filter((b) => Math.abs(b.i - mid) <= 1 && Math.abs(b.j - mid) <= 1);
    return blocks.indexOf(rng.pick(cands));
  })();
  const startBlock = blocks[startIdx];
  startBlock.type = 'start';
  const border = blocks.filter((b) => b.i === 0 || b.j === 0 || b.i === n - 1 || b.j === n - 1);
  border.sort((a, b) => Math.hypot(b.x - startBlock.x, b.z - startBlock.z) - Math.hypot(a.x - startBlock.x, a.z - startBlock.z));
  const houseBlock = rng.pick(border.slice(0, Math.max(1, Math.ceil(border.length / 4))));
  houseBlock.type = 'house';
  const free = () => blocks.filter((b) => b.type === 'residential');
  // Petit centre commerçant autour du milieu de la ville
  const central = free().filter((b) => Math.max(Math.abs(b.i - mid), Math.abs(b.j - mid)) <= (n > 5 ? 1.5 : 1));
  const cinemaBlock = rng.pick(central.length ? central : free());
  cinemaBlock.type = 'cinema';
  for (const b of free()) {
    const c = Math.max(Math.abs(b.i - mid), Math.abs(b.j - mid));
    const r = rng.next();
    if (c <= (n > 5 ? 1.5 : 1) && r < 0.6) b.type = 'buildings';
    else if (r < 0.12) b.type = 'park';
    else if (r < 0.19) b.type = 'parking';
  }

  // --- Sol, routes ---
  const groundSize = extent * 2 + 400;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), lawnMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2, extent * 2), asphaltMaterial());
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0;
  asphalt.receiveShadow = true;
  root.add(asphalt);
  physics.addBox(0, -0.5, 0, groundSize / 2, 0.5, groundSize / 2);

  // Limites de la ville : murs invisibles (au-delà, le quartier continue en décor)
  for (const s of SIDES) {
    const d = extent + 0.8;
    const len = extent * 2 + 3.2;
    const w = s.nx !== 0 ? 1.2 : len;
    const dd = s.nz !== 0 ? 1.2 : len;
    physics.addBox(s.nx * d, 5, s.nz * d, w / 2, 5, dd / 2);
  }

  // Marquage : double ligne jaune continue au centre, passages piétons aux carrefours
  const lines: number[] = [];
  for (let k = 0; k < n + 1; k++) lines.push(blockCenter(n, k) - PITCH / 2);
  lines[0] = blockCenter(n, 0) - HALF - ROAD / 2;
  lines[n] = blockCenter(n, n - 1) + HALF + ROAD / 2;
  for (const c of lines) {
    for (let k = 0; k < n; k++) {
      const b = blockCenter(n, k);
      for (const off of [-0.11, 0.11]) {
        yellow.add(c + off, 0.004, b, 0, 0.1, 0.02, HALF * 2 - 1);
        yellow.add(b, 0.004, c + off, 0, HALF * 2 - 1, 0.02, 0.1);
      }
    }
  }
  for (const cx of lines) {
    for (const cz of lines) {
      for (const s of SIDES) {
        const inside = Math.abs(cx + s.nx * 7) < extent && Math.abs(cz + s.nz * 7) < extent;
        if (!inside) continue;
        // Passage piéton « échelle » : deux bandes longitudinales + barreaux
        const px = cx + s.nx * 6.6;
        const pz = cz + s.nz * 6.6;
        const along = s.nx !== 0;
        for (const e of [-1.25, 1.25]) {
          stripes.add(px + (along ? e : 0), 0.005, pz + (along ? 0 : e), 0, along ? 0.25 : 9.4, 0.02, along ? 9.4 : 0.25);
        }
        for (let k = -4.2; k <= 4.2; k += 1.2) {
          stripes.add(px + (along ? 0 : k), 0.006, pz + (along ? k : 0), 0, along ? 2.5 : 0.5, 0.02, along ? 0.5 : 2.5);
        }
      }
    }
  }

  // --- Blocs ---
  const sideOccupied = new Map<string, number[]>();
  const occupy = (b: Block, si: number, t: number) => {
    const key = `${b.i},${b.j},${si}`;
    if (!sideOccupied.has(key)) sideOccupied.set(key, []);
    sideOccupied.get(key)!.push(t);
  };
  const isFree = (b: Block, si: number, t: number, gap: number) =>
    (sideOccupied.get(`${b.i},${b.j},${si}`) ?? []).every((o) => Math.abs(o - t) >= gap);

  let houseDoor: Placement = { x: 0, y: 0, z: 0, rotY: 0 };
  let houseFront = { x: 0, z: 0 };
  let houseSide = 0;
  let houseT = 0;
  let start: Placement = { x: 0, y: 0, z: 0, rotY: 0 };
  let tricycleSpawn: Placement = { x: 0, y: 0, z: 0, rotY: 0 };
  let cinemaSide = 0;

  const addBench = (x: number, z: number, rot: number, label: string, withSpots = true) => {
    benches.add(x, SLAB_H, z, rot);
    physics.addBox(x, SLAB_H + 0.45, z, 0.85, 0.45, 0.27, rot);
    if (withSpots) {
      const bx = -Math.sin(rot);
      const bz = -Math.cos(rot);
      spots.push({ x: x + bx * 0.75, y: SLAB_H, z: z + bz * 0.75, kind: 'behind', label: `derrière un banc ${label}` });
      spots.push({ x, y: SLAB_H, z, kind: 'nook', label: `sous un banc ${label}` });
    }
  };
  const addBin = (x: number, z: number, rot: number, label: string) => {
    bins.add(x, SLAB_H, z, rot, 1, 1, 1, rng.pick(BIN_COLORS));
    physics.addBox(x, SLAB_H + 0.5, z, 0.31, 0.5, 0.37, rot);
    spots.push({ x, y: SLAB_H + 0.9, z, kind: 'nook', label: `dans une poubelle ${label}` });
  };
  const addTree = (x: number, z: number, y = SLAB_H, scale = 1) => {
    const s = rng.range(0.85, 1.2) * scale;
    const r = rng.range(0, Math.PI * 2);
    trunks.add(x, y, z, r, s, s, s);
    leaves.add(x, y, z, r, s, s * rng.range(0.9, 1.15), s, new THREE.Color().setHSL(rng.range(0.2, 0.3), 0.3, rng.range(0.42, 0.55)).multiplyScalar(1.9));
    physics.addCylinder(x, y + 1.5, z, 1.5, 0.25 * s);
  };
  // Poteaux électriques, par rue, pour tendre les fils ensuite
  const poleLines = new Map<string, Array<{ p: THREE.Vector3; along: 'x' | 'z' }>>();
  const addPole = (b: Block, si: number, t: number, k: number) => {
    const s = SIDES[si];
    const p = at(b, s, PROP_LINE, t);
    const rot = s.rot;
    const kind = k % 2 === 0 ? polesLight : k % 3 === 0 ? polesTrans : polesPlain;
    kind.add(p.x, SLAB_H, p.z, rot);
    physics.addCylinder(p.x, SLAB_H + 4.5, p.z, 4.5, 0.16);
    occupy(b, si, t);
    const key = s.nx !== 0 ? `v:${(b.x + s.nx * (HALF + ROAD / 2)).toFixed(1)}` : `h:${(b.z + s.nz * (HALF + ROAD / 2)).toFixed(1)}`;
    if (!poleLines.has(key)) poleLines.set(key, []);
    poleLines.get(key)!.push({ p: new THREE.Vector3(p.x, SLAB_H, p.z), along: s.nx !== 0 ? 'z' : 'x' });
  };

  for (const b of blocks) {
    const commercial = b.type === 'buildings' || b.type === 'cinema';
    // Dalle de trottoir (béton) + bordure
    slabs.add(b.x, 0, b.z, 0, HALF * 2, SLAB_H, HALF * 2);
    for (const s of SIDES) {
      const along = s.nx === 0;
      curbs.add(b.x + s.nx * (HALF - 0.1), 0, b.z + s.nz * (HALF - 0.1), 0, along ? HALF * 2 + 0.25 : 0.25, SLAB_H + 0.015, along ? 0.25 : HALF * 2 + 0.25);
      // Bande d'herbe entre la bordure et le trottoir (sauf en centre-ville)
      if (!commercial) {
        const len = HALF * 2 - 5;
        const dm = (STRIP_IN + HALF - 0.25) / 2;
        const wdt = HALF - 0.25 - STRIP_IN;
        grass.add(b.x + s.nx * dm, SLAB_H, b.z + s.nz * dm, 0, along ? len : wdt, 0.03, along ? wdt : len);
      }
    }
    physics.addBox(b.x, SLAB_H / 2, b.z, HALF, SLAB_H / 2, HALF);

    switch (b.type) {
      case 'buildings':
        genBuildings(b);
        break;
      case 'park':
      case 'start':
        genPark(b);
        break;
      case 'parking':
        genParking(b);
        break;
      case 'residential':
      case 'house':
        genResidential(b);
        break;
      case 'cinema':
        genCinema(b);
        break;
    }
    genSidewalk(b, commercial);
  }

  function genBuildings(b: Block): void {
    type R = { x0: number; x1: number; z0: number; z1: number };
    const leavesR: R[] = [];
    const split = (r: R, depth: number) => {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      if (depth >= 3 || (w < 14 && d < 14) || (depth > 0 && rng.chance(0.25))) {
        leavesR.push(r);
        return;
      }
      const gap = depth === 0 || rng.chance(0.5) ? 2.6 : 0;
      const alongX = w > d ? true : w < d ? false : rng.chance(0.5);
      if (alongX) {
        const c = r.x0 + w * rng.range(0.35, 0.65);
        split({ ...r, x1: c - gap / 2 }, depth + 1);
        split({ ...r, x0: c + gap / 2 }, depth + 1);
        if (gap > 0) spots.push({ x: b.x + c, y: SLAB_H, z: b.z + r.z0 + d * rng.range(0.3, 0.7), kind: 'nook', label: "au fond d'une ruelle" });
      } else {
        const c = r.z0 + d * rng.range(0.35, 0.65);
        split({ ...r, z1: c - gap / 2 }, depth + 1);
        split({ ...r, z0: c + gap / 2 }, depth + 1);
        if (gap > 0) spots.push({ x: b.x + r.x0 + w * rng.range(0.3, 0.7), y: SLAB_H, z: b.z + c, kind: 'nook', label: "au fond d'une ruelle" });
      }
    };
    split({ x0: -INNER, x1: INNER, z0: -INNER, z1: INNER }, 0);
    for (const r of leavesR) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      if (w < 3 || d < 3) continue;
      const e = 0.01;
      const street = { px: r.x1 > INNER - e, nx: r.x0 < -INNER + e, pz: r.z1 > INNER - e, nz: r.z0 < -INNER + e };
      addBuilding(b.x + (r.x0 + r.x1) / 2, b.z + (r.z0 + r.z1) / 2, w, d, street);
    }
  }

  function genPark(b: Block): void {
    grass.add(b.x, SLAB_H, b.z, 0, INNER * 2, 0.03, INNER * 2);
    // Allées en croix en béton
    paths.add(b.x, SLAB_H, b.z, 0, 2.6, 0.04, INNER * 2);
    paths.add(b.x, SLAB_H, b.z, 0, INNER * 2, 0.04, 2.6);
    root.add(fountain(b.x, b.z));
    physics.addCylinder(b.x, SLAB_H + 0.3, b.z, 0.3, 2.4);
    for (let k = 0; k < 8; k++) {
      const sx = rng.chance(0.5) ? 1 : -1;
      const sz = rng.chance(0.5) ? 1 : -1;
      const x = b.x + sx * rng.range(4.5, 13);
      const z = b.z + sz * rng.range(4.5, 13);
      if (rng.chance(0.65)) addTree(x, z, SLAB_H + 0.03, 1.1);
      else {
        bushes.add(x, SLAB_H, z, rng.range(0, 6), 1.3, 1.1, 1.3);
        spots.push({ x: x + 1.1, y: SLAB_H + 0.03, z, kind: 'behind', label: 'derrière un buisson' });
      }
    }
    const benchSlots: Array<[number, number, number]> = [
      [-2.0, 6, Math.PI / 2],
      [2.0, -6, -Math.PI / 2],
      [6, 2.0, Math.PI],
      [-6, -2.0, 0],
    ];
    for (const [dx, dz, rot] of benchSlots) addBench(b.x + dx, b.z + dz, rot, 'du parc');
    addBin(b.x + 2.0, b.z + 9, Math.PI / 2, 'du parc');
    addBin(b.x - 9, b.z - 2.0, 0, 'du parc');
    spots.push({ x: b.x, y: SLAB_H + 0.04, z: b.z + 10, kind: 'open', label: "au milieu de l'allée" });
    spots.push({ x: b.x + 10, y: SLAB_H + 0.04, z: b.z, kind: 'open', label: "au milieu de l'allée" });
    spots.push({ x: b.x - 10, y: SLAB_H + 0.03, z: b.z + 8, kind: 'open', label: 'sur la pelouse' });
    if (b.type === 'start') start = { x: b.x - 2.0 + 1.0, y: SLAB_H + 0.04, z: b.z + 6, rotY: Math.PI / 2 };
  }

  function genParking(b: Block): void {
    lots.add(b.x, SLAB_H, b.z, 0, INNER * 2, 0.02, INNER * 2);
    for (const row of [-8, 8]) {
      for (let k = -12; k <= 12; k += 3) {
        stripes.add(b.x + k + 1.5, SLAB_H + 0.025, b.z + row, 0, 0.12, 0.01, 5);
        if (rng.chance(0.6)) {
          const x = b.x + k;
          const z = b.z + row;
          const rot = row < 0 ? 0 : Math.PI;
          cars.add(x, SLAB_H, z, rot, 0.95, 1, 0.95, rng.pick(CAR_PAINTS));
          physics.addBox(x, SLAB_H + 0.8, z, 0.9, 0.8, 1.95, rot);
          if (rng.chance(0.4)) spots.push({ x: x + 1.5, y: SLAB_H, z, kind: 'nook', label: 'entre deux voitures du parking' });
        }
      }
    }
    spots.push({ x: b.x, y: SLAB_H, z: b.z, kind: 'open', label: 'au milieu du parking' });
  }

  /** Quartier pavillonnaire : deux rangées de maisons dos à dos, jardins, allées, clôtures. */
  function genResidential(b: Block): void {
    const isHouse = b.type === 'house';
    const sidesIdx = rng.chance(0.5) ? [0, 2] : [1, 3];
    const specialSide = isHouse ? rng.pick(sidesIdx) : -1;
    grass.add(b.x, SLAB_H, b.z, 0, INNER * 2, 0.02, INNER * 2);
    const base = SLAB_H + 0.02;
    // Palissade de fond de jardin (ligne médiane) et fermeture côté rues latérales
    const s0 = SIDES[sidesIdx[0]];
    const alongX = s0.nx === 0; // rangées face à ±z : la ligne médiane court selon x
    const fence = (d0: number, t0: number, d1: number, t1: number, sref: Side) => {
      const a = at(b, sref, d0, t0);
      const c = at(b, sref, d1, t1);
      suburb.addFence(a.x, a.z, c.x, c.z, base);
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const rot = Math.atan2(c.x - a.x, c.z - a.z);
      physics.addBox((a.x + c.x) / 2, base + 0.9, (a.z + c.z) / 2, 0.06, 0.9, len / 2, rot);
    };
    fence(0, -INNER, 0, INNER, s0);
    void alongX;

    for (const si of sidesIdx) {
      const s = SIDES[si];
      const special = si === specialSide ? rng.int(0, 1) : -1;
      [-7.5, 7.5].forEach((lotT, k) => {
        const isArrival = k === special;
        const col = pickHouseColors(houseRng);
        const w = houseRng.range(8.4, 9.8);
        const d = houseRng.range(7.4, 8.4);
        const garage = (isArrival ? 1 : houseRng.chance(0.8) ? (houseRng.chance(0.5) ? 1 : -1) : 0) as -1 | 0 | 1;
        const d0 = 9.4 - d / 2;
        const tc = lotT + garage * 1.8;
        const c = at(b, s, d0, tc);
        const spec: HouseSpec = {
          x: c.x,
          z: c.z,
          base,
          rot: s.rot,
          w,
          d,
          stories: isArrival ? 1 : houseRng.chance(0.4) ? 2 : 1,
          brick: isArrival ? false : col.brick,
          wall: isArrival ? 0x7fa6d6 : col.wall,
          roof: isArrival ? 0x7a3b33 : col.roof,
          door: isArrival ? 0xffd24a : col.door,
          shutters: isArrival ? 0xf4f2ec : col.shutters,
          garage,
        };
        for (const cb of suburb.addHouse(spec)) {
          physics.addBox(cb.x, base + cb.h / 2, cb.z, cb.hw, cb.h / 2, cb.hd);
          footprints.push({ minX: cb.x - cb.hw, maxX: cb.x + cb.hw, minZ: cb.z - cb.hd, maxZ: cb.z + cb.hd });
        }
        // Allée du garage (ou de stationnement) jusqu'à la bordure, allée piétonne vers le porche
        const gx = garage !== 0 ? garage * (w / 2 + 1.8) : (houseRng.chance(0.5) ? 1 : -1) * (w / 2 + 1.7);
        const driveT = tc - gx;
        const doorX = garage === 1 ? -w * 0.18 : w * 0.18;
        const walkT = tc - doorX;
        const strip = (dA: number, dB: number, t: number, width: number, y: number) => {
          const m = at(b, s, (dA + dB) / 2, t);
          const len = dB - dA;
          paths.add(m.x, y, m.z, 0, s.nx !== 0 ? len : width, 0.045, s.nx !== 0 ? width : len);
        };
        strip(9.4, INNER, driveT, 3.0, base);
        strip(STRIP_IN, HALF - 0.25, driveT, 3.0, SLAB_H);
        strip(9.4 + 1.8, INNER, walkT, 1.1, base);
        occupy(b, si, driveT);
        occupy(b, si, driveT - 1.4);
        occupy(b, si, driveT + 1.4);
        spots.push({ ...at(b, s, 13, driveT), y: base + 0.04, kind: 'open', label: "dans l'allée du garage" });
        spots.push({ ...at(b, s, 12.5, lotT + (driveT > lotT ? -4.5 : 4.5)), y: base, kind: 'open', label: 'sur la pelouse' });

        // Boîte aux lettres et poubelles au bord de la rue
        const mb = at(b, s, PROP_LINE, driveT + 2.0);
        mailboxes.add(mb.x, SLAB_H, mb.z, s.rot);
        physics.addBox(mb.x, SLAB_H + 0.6, mb.z, 0.15, 0.6, 0.3, s.rot);
        occupy(b, si, driveT + 2.0);
        const mbBehind = at(b, s, PROP_LINE - 0.7, driveT + 2.0);
        spots.push({ x: mbBehind.x, y: SLAB_H, z: mbBehind.z, kind: 'behind', label: 'derrière une boîte aux lettres' });
        if (houseRng.chance(0.55)) {
          const bp = at(b, s, PROP_LINE, driveT - 2.2);
          addBin(bp.x, bp.z, s.rot + Math.PI, 'devant une maison');
          occupy(b, si, driveT - 2.2);
          const bb = at(b, s, PROP_LINE - 0.75, driveT - 2.2);
          spots.push({ x: bb.x, y: SLAB_H, z: bb.z, kind: 'behind', label: 'derrière une poubelle' });
        }

        // Devant : clôture à piquets, haie ou rien
        const frontStyle = isArrival ? 0 : houseRng.next();
        const gaps = [
          [driveT - 1.7, driveT + 1.7],
          [walkT - 0.8, walkT + 0.8],
        ].sort((p, q) => p[0] - q[0]);
        const segs: Array<[number, number]> = [];
        let cur = lotT - 7.3;
        for (const [g0, g1] of gaps) {
          if (g0 > cur + 0.4) segs.push([cur, g0]);
          cur = Math.max(cur, g1);
        }
        if (lotT + 7.3 > cur + 0.4) segs.push([cur, lotT + 7.3]);
        for (const [t0, t1] of segs) {
          if (frontStyle < 0.4) {
            const a = at(b, s, INNER - 0.25, t0);
            const e = at(b, s, INNER - 0.25, t1);
            suburb.addPicket(a.x, a.z, e.x, e.z, base);
            physics.addBox((a.x + e.x) / 2, base + 0.5, (a.z + e.z) / 2, s.nx !== 0 ? 0.05 : Math.abs(t1 - t0) / 2, 0.5, s.nx !== 0 ? Math.abs(t1 - t0) / 2 : 0.05);
          } else if (frontStyle < 0.7) {
            const m = at(b, s, INNER - 0.45, (t0 + t1) / 2);
            const len = Math.abs(t1 - t0);
            hedges.add(m.x, base, m.z, 0, s.nx !== 0 ? 0.8 : len, 1.1, s.nx !== 0 ? len : 0.8);
            physics.addBox(m.x, base + 0.55, m.z, s.nx !== 0 ? 0.4 : len / 2, 0.55, s.nx !== 0 ? len / 2 : 0.4);
            const hb = at(b, s, INNER - 1.3, (t0 + t1) / 2);
            spots.push({ x: hb.x, y: base, z: hb.z, kind: 'behind', label: 'derrière une haie' });
          }
        }
        // Arbre dans le jardin de devant
        if (houseRng.chance(0.55)) {
          const tt = lotT + (driveT > lotT ? -4.8 : 4.8);
          const tp = at(b, s, 12.4, tt);
          addTree(tp.x, tp.z, base, 1.05);
        }
        // Jardin de derrière : recoin
        const back = at(b, s, 1.2, lotT + (driveT > lotT ? -3 : 3));
        spots.push({ x: back.x, y: base, z: back.z, kind: 'nook', label: 'dans un jardin, derrière une maison' });

        if (isArrival) {
          houseSide = si;
          houseT = walkT;
          const dp = at(b, s, 9.4 + 1.1, walkT);
          houseDoor = { x: dp.x, y: base + 0.3, z: dp.z, rotY: s.rot };
          const f = at(b, s, 21.5, walkT);
          houseFront = { x: f.x, z: f.z };
          root.add(houseSign(at(b, s, 9.4 + 1.8 + 0.5, walkT + 1.2), s.rot, base));
        }
      });
      // Séparation entre les deux jardins de derrière, et fermeture côté rue latérale
      fence(0.2, 0, 5.4, 0, s);
      fence(0.2, -INNER + 0.3, 6.5, -INNER + 0.3, s);
      fence(0.2, INNER - 0.3, 6.5, INNER - 0.3, s);
    }
  }

  function genCinema(b: Block): void {
    cinemaSide = rng.int(0, 3);
    const s = SIDES[cinemaSide];
    const wall = 0xa76c52;
    const accent = 0x8a1f2c;
    const none = { px: false, nx: false, pz: false, nz: false };
    const lobbyW = 9;
    const lobbyD = 7;
    const along = s.nx !== 0;
    const toWorld = (d: number, t: number, sd: number, st: number) => {
      const c = at(b, s, d, t);
      return { x: c.x, z: c.z, sx: along ? sd : st, sz: along ? st : sd };
    };
    const back = toWorld((-INNER + (INNER - lobbyD)) / 2, 0, INNER * 2 - lobbyD, INNER * 2);
    const h = addBuilding(back.x, back.z, back.sx, back.sz, none, { floors: 2, wall, accent });
    const wingW = (INNER * 2 - lobbyW) / 2;
    for (const side of [-1, 1]) {
      const wing = toWorld(INNER - lobbyD / 2, side * (lobbyW / 2 + wingW / 2), lobbyD, wingW);
      addBuilding(wing.x, wing.z, wing.sx, wing.sz, none, { floors: 2, wall, accent });
    }
    const top = toWorld(INNER - lobbyD / 2, 0, lobbyD, lobbyW);
    arch.addBox(top.x, SLAB_H + 4 + (h - 4) / 2, top.z, top.sx, h - 4, top.sz, wall);
    physics.addBox(top.x, SLAB_H + 4 + (h - 4) / 2, top.z, top.sx / 2, (h - 4) / 2, top.sz / 2);

    const cp = toWorld(INNER - lobbyD / 2 + 1.5, 0, lobbyD + 3, 4.5);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(cp.sx, 0.03, cp.sz), plainMaterial(0xc2334a, 1));
    carpet.position.set(cp.x, SLAB_H + 0.015, cp.z);
    carpet.receiveShadow = true;
    root.add(carpet);
    const lobbyFloor = toWorld(INNER - lobbyD / 2, 0, lobbyD, lobbyW);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(lobbyFloor.sx, 0.02, lobbyFloor.sz), plainMaterial(0x7a2f5a, 1));
    floor.position.set(lobbyFloor.x, SLAB_H + 0.01, lobbyFloor.z);
    floor.receiveShadow = true;
    root.add(floor);
    carpets.push({
      minX: Math.min(cp.x - cp.sx / 2, lobbyFloor.x - lobbyFloor.sx / 2),
      maxX: Math.max(cp.x + cp.sx / 2, lobbyFloor.x + lobbyFloor.sx / 2),
      minZ: Math.min(cp.z - cp.sz / 2, lobbyFloor.z - lobbyFloor.sz / 2),
      maxZ: Math.max(cp.z + cp.sz / 2, lobbyFloor.z + lobbyFloor.sz / 2),
    });
    const sign = makeSign('CINÉMA', '#ffe27a', '#6b2d8c');
    const sp = at(b, s, INNER + 0.3, 0);
    sign.position.set(sp.x, SLAB_H + 5.2, sp.z);
    sign.rotation.y = s.rot;
    root.add(sign);

    const t = at(b, s, INNER - 4, 1.5);
    tricycleSpawn = { x: t.x, y: SLAB_H, z: t.z, rotY: s.rot + Math.PI / 2 };
    spots.push({ ...at(b, s, INNER - 6.2, -3.5), y: SLAB_H, kind: 'nook', label: 'au fond du hall du cinéma' });
    for (const dt of [-3, 0, 3]) occupy(b, cinemaSide, dt);
  }

  function genSidewalk(b: Block, commercial: boolean): void {
    // Bouche d'incendie à un coin
    const hs = SIDES[rng.int(0, 3)];
    const hp = at(b, hs, PROP_LINE, rng.chance(0.5) ? 13.5 : -13.5);
    hydrants.add(hp.x, SLAB_H, hp.z, rng.range(0, 6));
    physics.addCylinder(hp.x, SLAB_H + 0.45, hp.z, 0.45, 0.22);
    spots.push({ x: hp.x + 0.6, y: SLAB_H, z: hp.z, kind: 'behind', label: "derrière une bouche d'incendie" });

    SIDES.forEach((s, si) => {
      // Poteaux électriques côté +x / +z de chaque bloc : une ligne continue par rue
      if (si === 0 || si === 1) {
        [-11.5, 11.5].forEach((t0, k) => {
          let t = t0;
          for (const off of [0, 2.5, -2.5, 4]) {
            if (isFree(b, si, t0 + off, 1.6)) {
              t = t0 + off;
              break;
            }
          }
          addPole(b, si, t, k + b.i + b.j);
        });
      }
      // Arbres d'alignement dans la bande d'herbe (ou quelques-uns en centre-ville)
      for (const t of [-5.5, 5.5]) {
        if (!isFree(b, si, t, 2.6) || !rng.chance(commercial ? 0.4 : 0.8)) continue;
        const p = at(b, s, PROP_LINE, t);
        addTree(p.x, p.z, SLAB_H + 0.03);
        occupy(b, si, t);
        const bp = at(b, s, PROP_LINE - 0.9, t + 0.3);
        spots.push({ x: bp.x, y: SLAB_H, z: bp.z, kind: 'behind', label: 'derrière un arbre' });
      }
      if (commercial) {
        for (let k = 0; k < 2; k++) {
          const t = rng.range(-13, 13);
          if (!isFree(b, si, t, 2.6)) continue;
          occupy(b, si, t);
          const p = at(b, s, PROP_LINE, t);
          if (rng.chance(0.5)) addBench(p.x, p.z, s.rot, 'au bord de la rue');
          else addBin(p.x, p.z, s.rot + Math.PI, 'du trottoir');
        }
      }
      for (let k = 0; k < 2; k++) {
        const t = rng.range(-13, 13);
        const p = at(b, s, WALK_LINE, t);
        spots.push({ x: p.x, y: SLAB_H, z: p.z, kind: 'open', label: 'sur le trottoir' });
      }
      // Voitures garées le long du trottoir
      for (let t = -13; t <= 13; t += 6.5) {
        if (!rng.chance(0.28)) continue;
        const tt = t + rng.range(-0.8, 0.8);
        if (!isFree(b, si, tt, 3.2)) continue;
        const p = at(b, s, PARK_LINE, tt);
        if (Math.abs(p.x) > extent - 3 || Math.abs(p.z) > extent - 3) continue;
        if (b === houseBlock && si === houseSide && Math.abs(tt - houseT) < 8) continue;
        const rot = s.rot + (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
        cars.add(p.x, 0, p.z, rot, 1, 1, 1, rng.pick(CAR_PAINTS));
        physics.addBox(p.x, 0.8, p.z, 0.9, 0.8, 2, rot);
        const hp2 = at(b, s, HALF + 0.25, tt);
        spots.push({ x: hp2.x, y: 0, z: hp2.z, kind: 'behind', label: 'derrière une voiture garée' });
        parkedCars.push({ x: p.x, z: p.z });
      }
    });
  }

  // Fils électriques entre poteaux voisins d'une même rue
  for (const list of poleLines.values()) {
    list.sort((a, c) => (a.along === 'x' ? a.p.x - c.p.x : a.p.z - c.p.z));
    for (let k = 0; k + 1 < list.length; k++) {
      const a = list[k].p;
      const c = list[k + 1].p;
      if (a.distanceTo(c) > 32) continue;
      const alongX = list[k].along === 'x';
      for (const off of [-1.05, 0, 1.05]) {
        const pa = new THREE.Vector3(a.x + (alongX ? 0 : 0), a.y + 8.62, a.z);
        const pc = new THREE.Vector3(c.x, c.y + 8.62, c.z);
        // La traverse est parallèle à la rue : les fils sont décalés le long de la traverse… et donc
        // tous alignés ; on les écarte perpendiculairement pour qu'ils restent lisibles.
        if (alongX) {
          pa.z += off * 0.35;
          pc.z += off * 0.35;
        } else {
          pa.x += off * 0.35;
          pc.x += off * 0.35;
        }
        suburb.addWire(pa, pc, 0.6 + Math.abs(off) * 0.1);
      }
    }
  }

  // --- Voiture du joueur, trottinette ---
  const dist = (a: { x: number; z: number }, c: { x: number; z: number }) => Math.hypot(a.x - c.x, a.z - c.z);
  const sh = dist(startBlock, houseBlock);
  const carCands = blocks.filter(
    (b) => b !== houseBlock && b !== startBlock && dist(b, startBlock) > sh * 0.35 && dist(b, houseBlock) > sh * 0.35,
  );
  const carBlock = carCands.length ? rng.pick(carCands) : blocks.find((b) => b !== startBlock && b !== houseBlock)!;
  let carSpawn: Placement = { x: 0, y: 0, z: 0, rotY: 0 };
  for (let attempt = 0; attempt < 60; attempt++) {
    const si = rng.int(0, 3);
    const s = SIDES[si];
    const t = rng.range(-9, 9);
    const p = at(carBlock, s, PARK_LINE, t);
    if (Math.abs(p.x) > extent - 3 || Math.abs(p.z) > extent - 3) continue;
    if (parkedCars.some((c) => dist(c, p) < 6)) continue;
    carSpawn = { x: p.x, y: 0, z: p.z, rotY: Math.atan2(s.tx, s.tz) };
    break;
  }

  const scooterSide = SIDES[rng.int(0, 3)];
  const sc = at(startBlock, scooterSide, WALK_LINE - 0.3, rng.range(-6, 6));
  const scooterSpawn: Placement = { x: sc.x, y: SLAB_H, z: sc.z, rotY: scooterSide.rot + Math.PI / 2 };

  // --- Au-delà de la dernière rue : le quartier continue (maisons de décor, sans collision) ---
  const OUT = extent;
  for (const s of SIDES) {
    const along = s.nz !== 0;
    const len = along ? (OUT + 16) * 2 : OUT * 2;
    slabs.add(s.nx * (extent + 1.6), 0, s.nz * (extent + 1.6), 0, along ? len : 3.2, SLAB_H, along ? 3.2 : len);
    curbs.add(s.nx * (extent + 0.12), 0, s.nz * (extent + 0.12), 0, along ? len : 0.25, SLAB_H + 0.015, along ? 0.25 : len);
    grass.add(s.nx * (OUT + 20), 0, s.nz * (OUT + 20), 0, along ? len : 34, SLAB_H + 0.02, along ? 34 : len);
    let t = -len / 2 + 2;
    while (t < len / 2 - 8) {
      const col = pickHouseColors(houseRng);
      const w = houseRng.range(8.4, 9.8);
      const dd = 8;
      const gar = (houseRng.chance(0.7) ? (houseRng.chance(0.5) ? 1 : -1) : 0) as -1 | 0 | 1;
      const center = OUT + 3.2 + 6 + dd / 2;
      const tt = t + 7.5;
      const x = s.nx * center + (along ? tt : 0);
      const z = s.nz * center + (along ? 0 : tt);
      suburb.addHouse({ x, z, base: SLAB_H + 0.02, rot: s.rot + Math.PI, w, d: dd, stories: houseRng.chance(0.4) ? 2 : 1, garage: gar, ...col });
      if (houseRng.chance(0.6)) {
        const tx = s.nx * (OUT + 6) + (along ? t + 2 : 0);
        const tz = s.nz * (OUT + 6) + (along ? 0 : t + 2);
        trunks.add(tx, SLAB_H, tz, houseRng.range(0, 6), 1.1, 1.1, 1.1);
        leaves.add(tx, SLAB_H, tz, houseRng.range(0, 6), 1.1, 1.1, 1.1, new THREE.Color().setHSL(0.25, 0.3, 0.5).multiplyScalar(1.9));
      }
      t += 15;
    }
  }

  for (const batch of [
    slabs,
    paths,
    curbs,
    grass,
    lots,
    stripes,
    yellow,
    benches,
    bins,
    trunks,
    leaves,
    bushes,
    hydrants,
    mailboxes,
    polesPlain,
    polesLight,
    polesTrans,
    cars,
    hedges,
  ]) {
    const mesh = batch.build();
    if (mesh) root.add(mesh);
  }
  const facades = buildings.build(facadeMaterial());
  if (facades) root.add(facades);
  for (const o of arch.build()) root.add(o);
  for (const o of suburb.build()) root.add(o);

  return {
    n,
    extent,
    blocks,
    root,
    spots,
    start,
    house: { door: houseDoor, front: houseFront, block: houseBlock },
    carSpawn,
    scooterSpawn,
    tricycleSpawn,
    carpets,
    footprints,
  };
}

/** Pancarte « MAISON » plantée dans le jardin de la maison d'arrivée. */
function houseSign(p: { x: number; z: number }, rot: number, base: number): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff7ee';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#2d4a7a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#2d4a7a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Trebuchet MS, sans-serif';
  ctx.fillText('MAISON', 128, 64);
  ctx.font = 'italic 28px Trebuchet MS, sans-serif';
  ctx.fillText('Enfin.', 128, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.04), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 }));
  board.position.y = 1.0;
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 1.0, 0.07),
    new THREE.MeshStandardNodeMaterial({ color: 0x6a553f, roughness: 0.9 }),
  );
  post.position.y = 0.5;
  board.castShadow = post.castShadow = true;
  g.add(board, post);
  g.position.set(p.x, base, p.z);
  g.rotation.y = rot;
  return g;
}

function fountain(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardNodeMaterial({ color: 0xd8cfbf, roughness: 0.85 });
  const lathe = (pts: Array<[number, number]>, seg = 28) =>
    new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const basin = new THREE.Mesh(
    lathe([
      [2.0, 0],
      [2.45, 0.02],
      [2.5, 0.12],
      [2.4, 0.45],
      [2.55, 0.55],
      [2.55, 0.65],
      [2.3, 0.66],
      [2.25, 0.3],
    ]),
    stone,
  );
  const column = new THREE.Mesh(
    lathe([
      [0.001, 0],
      [0.45, 0],
      [0.35, 0.3],
      [0.22, 0.6],
      [0.2, 1.3],
      [0.3, 1.4],
      [1.05, 1.5],
      [1.1, 1.62],
      [0.95, 1.64],
      [0.25, 1.62],
      [0.16, 1.9],
      [0.14, 2.3],
      [0.22, 2.35],
      [0.6, 2.45],
      [0.62, 2.55],
      [0.5, 2.56],
      [0.12, 2.6],
      [0.1, 2.9],
      [0.16, 2.98],
      [0.001, 3.08],
    ]),
    stone,
  );
  const waterMat = new THREE.MeshStandardNodeMaterial({ color: 0x7ab8d4, roughness: 0.08, metalness: 0.1 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.28, 32), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.52;
  const water2 = new THREE.Mesh(new THREE.CircleGeometry(0.98, 20), waterMat);
  water2.rotation.x = -Math.PI / 2;
  water2.position.y = 1.6;
  for (const m of [basin, column]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(basin, column, water, water2);
  g.position.set(x, SLAB_H, z);
  return g;
}

function makeSign(text: string, fg: string, bg: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = fg;
  ctx.font = 'bold 78px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6 });
  return new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.3), mat);
}
