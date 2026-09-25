import * as THREE from 'three/webgpu';
import type { Physics } from '../core/Physics';
import { RNG } from '../core/rng';
import { InstanceBatch } from './Batch';
import { buildingMaterial, plainMaterial, vertexColorMaterial } from './materials';
import {
  benchGeometry,
  binGeometry,
  bushGeometry,
  carGeometry,
  gableGeometry,
  hydrantGeometry,
  lampGeometry,
  treeGeometry,
} from './props';
import { buildHouse } from './House';

import { PITCH, HALF, INNER, ROAD, SLAB_H } from './constants';
export { PITCH, HALF, INNER, ROAD, SLAB_H };
const PROP_LINE = 16.9;
const WALK_LINE = 15.9;
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

const PALETTE = [0xf4a9a8, 0xf7d08a, 0xa8d8b9, 0x9ec1e8, 0xc8a8e0, 0xf7b58a, 0xefe6cf, 0x8fd3d1, 0xf2c4de, 0xd6e89a];
const CAR_PAINTS = [0xe8504a, 0x4a90d9, 0xf2c14e, 0x5dbb8a, 0xf2f2f2, 0x9b6fd1, 0xff8a5b, 0x2f3e5c];

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
  const buildings = new InstanceBatch(unitBox, buildingMaterial());
  const trims = new InstanceBatch(unitBox, plainMaterial(0xffffff, 0.9));
  const slabs = new InstanceBatch(unitBox, plainMaterial(0xd9d0c6, 0.95), { castShadow: false });
  const curbs = new InstanceBatch(unitBox, plainMaterial(0xb9aea3, 0.95), { castShadow: false });
  const grass = new InstanceBatch(unitBox, plainMaterial(0x93cf73, 1), { castShadow: false });
  const lots = new InstanceBatch(unitBox, plainMaterial(0x6d6c7c, 1), { castShadow: false });
  const stripes = new InstanceBatch(unitBox, plainMaterial(0xf6f1e7, 0.8), { castShadow: false });
  const benches = new InstanceBatch(benchGeometry(), vmat);
  const bins = new InstanceBatch(binGeometry(), vmat);
  const lamps = new InstanceBatch(lampGeometry(), vmat);
  const trees = new InstanceBatch(treeGeometry(), vmat);
  const bushes = new InstanceBatch(bushGeometry(), vmat);
  const hydrants = new InstanceBatch(hydrantGeometry(), vmat);
  const cars = new InstanceBatch(carGeometry(), vmat);
  const roofs = new InstanceBatch(gableGeometry(), plainMaterial(0xffffff, 0.8, true));
  const houseWalls = new InstanceBatch(unitBox, buildingMaterial());
  const hedges = new InstanceBatch(unitBox, plainMaterial(0x5fae5a, 1));

  const spots: Spot[] = [];
  const parkedCars: Array<{ x: number; z: number }> = [];
  const footprints: Rect[] = [];
  const carpets: Rect[] = [];

  const addBuilding = (cx: number, cz: number, w: number, d: number, h: number, colorHex: number) => {
    buildings.add(cx, SLAB_H, cz, 0, w, h, d, colorHex);
    trims.add(cx, SLAB_H + h, cz, 0, w + 0.3, 0.35, d + 0.3, new THREE.Color(colorHex).multiplyScalar(0.8));
    physics.addBox(cx, SLAB_H + h / 2, cz, w / 2, h / 2, d / 2);
    footprints.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    // Petits équipements de toit
    if (w > 5 && d > 5 && rng.chance(0.7)) {
      trims.add(cx + rng.range(-w / 4, w / 4), SLAB_H + h + 0.35, cz + rng.range(-d / 4, d / 4), 0, 1.6, 1.1, 1.2, 0xc9c4d4);
    }
  };

  // --- Choix des blocs spéciaux ---
  const blocks: Block[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      blocks.push({ i, j, x: blockCenter(n, i), z: blockCenter(n, j), type: 'buildings' });
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
  const free = () => blocks.filter((b) => b.type === 'buildings');
  const cinemaBlock = rng.pick(free());
  cinemaBlock.type = 'cinema';
  for (const b of free()) {
    const r = rng.next();
    if (r < 0.17) b.type = 'park';
    else if (r < 0.25) b.type = 'parking';
    else if (r < 0.35) b.type = 'residential';
  }

  // --- Sol, routes ---
  const groundSize = extent * 2 + 400;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), plainMaterial(0xa9c98a, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2, extent * 2), plainMaterial(0x5b5c6e, 0.95));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0;
  asphalt.receiveShadow = true;
  root.add(asphalt);
  physics.addBox(0, -0.5, 0, groundSize / 2, 0.5, groundSize / 2);

  // Limites de la ville : haie + murs invisibles
  for (const s of SIDES) {
    const d = extent + 0.8;
    const len = extent * 2 + 3.2;
    const w = s.nx !== 0 ? 1.2 : len;
    const dd = s.nz !== 0 ? 1.2 : len;
    hedges.add(s.nx * d, 0, s.nz * d, 0, w, 1.4, dd);
    physics.addBox(s.nx * d, 5, s.nz * d, w / 2, 5, dd / 2);
  }

  // Marquage au sol : pointillés centraux et passages piétons
  const lines: number[] = [];
  for (let k = 0; k < n + 1; k++) lines.push(blockCenter(n, k) - PITCH / 2);
  lines[0] = blockCenter(n, 0) - HALF - ROAD / 2;
  lines[n] = blockCenter(n, n - 1) + HALF + ROAD / 2;
  for (const c of lines) {
    for (let k = 0; k < n; k++) {
      const b = blockCenter(n, k);
      for (let t = -HALF + 3; t <= HALF - 3; t += 4) {
        stripes.add(c, 0.005, b + t, 0, 0.15, 0.02, 2);
        stripes.add(b + t, 0.005, c, 0, 2, 0.02, 0.15);
      }
    }
  }
  for (const cx of lines) {
    for (const cz of lines) {
      for (const s of SIDES) {
        const inside = Math.abs(cx + s.nx * 7) < extent && Math.abs(cz + s.nz * 7) < extent;
        if (!inside) continue;
        for (let k = -4; k <= 4; k += 1.1) {
          const px = cx + s.nx * 7 + s.tx * k;
          const pz = cz + s.nz * 7 + s.tz * k;
          stripes.add(px, 0.006, pz, 0, s.nx !== 0 ? 2.6 : 0.55, 0.02, s.nz !== 0 ? 2.6 : 0.55);
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
  const addBin = (x: number, z: number, label: string) => {
    bins.add(x, SLAB_H, z, rng.range(0, Math.PI * 2));
    physics.addCylinder(x, SLAB_H + 0.45, z, 0.45, 0.36);
    spots.push({ x, y: SLAB_H + 0.75, z, kind: 'nook', label: `dans une poubelle ${label}` });
  };
  const addTree = (x: number, z: number, y = SLAB_H) => {
    const s = rng.range(0.85, 1.25);
    trees.add(x, y, z, rng.range(0, Math.PI * 2), s, s, s, new THREE.Color().setHSL(0, 0, rng.range(0.85, 1.05)));
    physics.addCylinder(x, y + 1.2, z, 1.2, 0.22 * s);
  };

  for (const b of blocks) {
    // Dalle du trottoir
    slabs.add(b.x, 0, b.z, 0, HALF * 2, SLAB_H, HALF * 2);
    curbs.add(b.x, 0, b.z, 0, HALF * 2 + 0.2, SLAB_H - 0.02, HALF * 2 + 0.2);
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
    genSidewalk(b);
  }

  function genBuildings(b: Block): void {
    type R = { x0: number; x1: number; z0: number; z1: number };
    const leaves: R[] = [];
    const split = (r: R, depth: number) => {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      if (depth >= 3 || (w < 16 && d < 16) || (depth > 0 && rng.chance(0.25))) {
        leaves.push(r);
        return;
      }
      const gap = depth === 0 || rng.chance(0.5) ? 2.6 : 0;
      const alongX = w > d ? true : w < d ? false : rng.chance(0.5);
      if (alongX) {
        const c = r.x0 + w * rng.range(0.35, 0.65);
        split({ ...r, x1: c - gap / 2 }, depth + 1);
        split({ ...r, x0: c + gap / 2 }, depth + 1);
        if (gap > 0) {
          const zc = r.z0 + d * rng.range(0.3, 0.7);
          spots.push({ x: b.x + c, y: SLAB_H, z: b.z + zc, kind: 'nook', label: 'au fond d\'une ruelle' });
        }
      } else {
        const c = r.z0 + d * rng.range(0.35, 0.65);
        split({ ...r, z1: c - gap / 2 }, depth + 1);
        split({ ...r, z0: c + gap / 2 }, depth + 1);
        if (gap > 0) {
          const xc = r.x0 + w * rng.range(0.3, 0.7);
          spots.push({ x: b.x + xc, y: SLAB_H, z: b.z + c, kind: 'nook', label: 'au fond d\'une ruelle' });
        }
      }
    };
    split({ x0: -INNER, x1: INNER, z0: -INNER, z1: INNER }, 0);
    for (const r of leaves) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      if (w < 3 || d < 3) continue;
      const h = rng.range(7, 13) + (rng.chance(0.35) ? rng.range(6, 18) : 0);
      addBuilding(b.x + (r.x0 + r.x1) / 2, b.z + (r.z0 + r.z1) / 2, w, d, h, rng.pick(PALETTE));
    }
  }

  function genPark(b: Block): void {
    const q = (INNER - 1.5) / 2 + 0.75;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        grass.add(b.x + sx * (q + 0.75), SLAB_H, b.z + sz * (q + 0.75), 0, INNER - 1.5, 0.04, INNER - 1.5);
      }
    }
    // Fontaine centrale
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 16), plainMaterial(0xcfc7bd));
    basin.position.set(b.x, SLAB_H + 0.3, b.z);
    basin.castShadow = basin.receiveShadow = true;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.05, 16), plainMaterial(0x7cc3e8, 0.2));
    water.position.set(b.x, SLAB_H + 0.55, b.z);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 8), plainMaterial(0xcfc7bd));
    spout.position.set(b.x, SLAB_H + 0.8, b.z);
    spout.castShadow = true;
    root.add(basin, water, spout);
    physics.addCylinder(b.x, SLAB_H + 0.3, b.z, 0.3, 2.4);

    // Arbres et buissons sur les pelouses
    for (let k = 0; k < 7; k++) {
      const sx = rng.chance(0.5) ? 1 : -1;
      const sz = rng.chance(0.5) ? 1 : -1;
      const x = b.x + sx * rng.range(4, 13);
      const z = b.z + sz * rng.range(4, 13);
      if (rng.chance(0.6)) addTree(x, z, SLAB_H + 0.04);
      else {
        bushes.add(x, SLAB_H, z, rng.range(0, 6));
        spots.push({ x: x + 0.9, y: SLAB_H + 0.04, z, kind: 'behind', label: 'derrière un buisson' });
      }
    }
    // Bancs le long des allées
    const benchSlots: Array<[number, number, number]> = [
      [-1.9, 6, Math.PI / 2],
      [1.9, -6, -Math.PI / 2],
      [6, 1.9, Math.PI],
      [-6, -1.9, 0],
    ];
    for (const [dx, dz, rot] of benchSlots) addBench(b.x + dx, b.z + dz, rot, 'du parc');
    addBin(b.x + 1.9, b.z + 9, 'du parc');
    addBin(b.x - 9, b.z - 1.9, 'du parc');
    spots.push({ x: b.x, y: SLAB_H, z: b.z + 10, kind: 'open', label: 'au milieu de l\'allée' });
    spots.push({ x: b.x + 10, y: SLAB_H, z: b.z, kind: 'open', label: 'au milieu de l\'allée' });
    spots.push({ x: b.x - 10, y: SLAB_H + 0.04, z: b.z + 8, kind: 'open', label: 'sur la pelouse' });
    if (b.type === 'start') {
      // Le banc du réveil
      start = { x: b.x - 1.9 + 1.0, y: SLAB_H, z: b.z + 6, rotY: Math.PI / 2 };
    }
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

  function genResidential(b: Block): void {
    const isHouse = b.type === 'house';
    // Maisons alignées sur deux côtés opposés
    const sidesIdx = rng.chance(0.5) ? [0, 2] : [1, 3];
    const specialSide = isHouse ? rng.pick(sidesIdx) : -1;
    grass.add(b.x, SLAB_H, b.z, 0, INNER * 2, 0.04, INNER * 2);
    for (const si of sidesIdx) {
      const s = SIDES[si];
      const slots = [-9.5, 0, 9.5];
      const special = si === specialSide ? rng.int(0, 2) : -1;
      slots.forEach((t, k) => {
        const isArrival = k === special;
        const d0 = 11 - 3.5; // centre de la maison (façade à d=11)
        const c = at(b, s, d0, t);
        const w = 7.4;
        const depth = 7;
        const h = rng.range(4.8, 6);
        const wallColor = isArrival ? 0x7fb7e6 : rng.pick(PALETTE);
        const roofColor = isArrival ? 0xe8504a : rng.pick([0xc0584f, 0x8f5a4a, 0x5e6e9e, 0x9a7b5a]);
        const along = s.nx !== 0; // façade perpendiculaire à x
        const sx = along ? depth : w;
        const sz = along ? w : depth;
        if (isArrival) {
          const house = buildHouse(c.x, c.z, s.rot, w, depth, h);
          root.add(house.object);
          houseDoor = { x: house.door.x, y: SLAB_H, z: house.door.z, rotY: s.rot };
        } else {
          houseWalls.add(c.x, SLAB_H, c.z, 0, sx, h, sz, wallColor);
          roofs.add(c.x, SLAB_H + h, c.z, along ? Math.PI / 2 : 0, w + 0.6, 2.4, depth + 0.6, roofColor);
        }
        physics.addBox(c.x, SLAB_H + h / 2, c.z, sx / 2, h / 2, sz / 2);
        footprints.push({ minX: c.x - sx / 2, maxX: c.x + sx / 2, minZ: c.z - sz / 2, maxZ: c.z + sz / 2 });
        // Haie du jardin de devant, avec un passage vers la porte
        for (const hs of [-1, 1]) {
          const hc = at(b, s, INNER - 0.4, t + hs * 2.4);
          const hl = 2.6;
          hedges.add(hc.x, SLAB_H, hc.z, 0, s.nx !== 0 ? 0.6 : hl, 0.9, s.nz !== 0 ? 0.6 : hl);
          physics.addBox(hc.x, SLAB_H + 0.45, hc.z, s.nx !== 0 ? 0.3 : hl / 2, 0.45, s.nz !== 0 ? 0.3 : hl / 2);
        }
        const hidden = at(b, s, INNER - 1.1, t + 2.6);
        spots.push({ x: hidden.x, y: SLAB_H + 0.04, z: hidden.z, kind: 'behind', label: 'derrière une haie' });
        if (isArrival) {
          houseSide = si;
          const f = at(b, s, 21.5, t);
          houseFront = { x: f.x, z: f.z };
          occupy(b, si, t);
          occupy(b, si, t - 2);
          occupy(b, si, t + 2);
        }
      });
    }
    // Arbres au fond des jardins
    for (let k = 0; k < 3; k++) addTree(b.x + rng.range(-4, 4), b.z + rng.range(-4, 4), SLAB_H + 0.04);
  }

  function genCinema(b: Block): void {
    cinemaSide = rng.int(0, 3);
    const s = SIDES[cinemaSide];
    const color = 0xb56ad6;
    const h = 11;
    // Hall ouvert (moquette) : 9 m de large, 7 m de profondeur, plafond à 4 m
    const lobbyW = 9;
    const lobbyD = 7;
    const along = s.nx !== 0;
    const toWorld = (d: number, t: number, sd: number, st: number) => {
      const c = at(b, s, d, t);
      return { x: c.x, z: c.z, sx: along ? sd : st, sz: along ? st : sd };
    };
    const back = toWorld((-INNER + (INNER - lobbyD)) / 2, 0, INNER * 2 - lobbyD, INNER * 2);
    addBuilding(back.x, back.z, back.sx, back.sz, h, color);
    const wingW = (INNER * 2 - lobbyW) / 2;
    for (const side of [-1, 1]) {
      const wing = toWorld(INNER - lobbyD / 2, side * (lobbyW / 2 + wingW / 2), lobbyD, wingW);
      addBuilding(wing.x, wing.z, wing.sx, wing.sz, h, color);
    }
    const top = toWorld(INNER - lobbyD / 2, 0, lobbyD, lobbyW);
    buildings.add(top.x, SLAB_H + 4, top.z, 0, top.sx, h - 4, top.sz, color);
    physics.addBox(top.x, SLAB_H + 4 + (h - 4) / 2, top.z, top.sx / 2, (h - 4) / 2, top.sz / 2);

    // Moquette : hall + trottoir devant
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

    // Enseigne lumineuse
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

  function genSidewalk(b: Block): void {
    SIDES.forEach((s, si) => {
      // Lampadaires réguliers
      for (const t of [-12, 0, 12]) {
        if (!isFree(b, si, t, 2)) continue;
        const p = at(b, s, PROP_LINE + 0.4, t);
        lamps.add(p.x, SLAB_H, p.z, s.rot);
        physics.addCylinder(p.x, SLAB_H + 2.3, p.z, 2.3, 0.12);
        occupy(b, si, t);
      }
      const count = rng.int(2, 4);
      for (let k = 0; k < count; k++) {
        const t = rng.range(-13, 13);
        if (!isFree(b, si, t, 2.6)) continue;
        occupy(b, si, t);
        const p = at(b, s, PROP_LINE, t);
        const r = rng.next();
        if (r < 0.35) addBench(p.x, p.z, s.rot, 'au bord de la rue');
        else if (r < 0.6) addBin(p.x, p.z, 'du trottoir');
        else if (r < 0.85 && b.type !== 'cinema') {
          addTree(p.x, p.z);
          const bp = at(b, s, PROP_LINE - 0.7, t + 0.3);
          spots.push({ x: bp.x, y: SLAB_H, z: bp.z, kind: 'behind', label: 'derrière un arbre' });
        } else {
          hydrants.add(p.x, SLAB_H, p.z, rng.range(0, 6));
          physics.addCylinder(p.x, SLAB_H + 0.35, p.z, 0.35, 0.2);
        }
      }
      // Emplacements « en évidence » sur le trottoir
      for (let k = 0; k < 2; k++) {
        const t = rng.range(-13, 13);
        const p = at(b, s, WALK_LINE, t);
        spots.push({ x: p.x, y: SLAB_H, z: p.z, kind: 'open', label: 'sur le trottoir' });
      }
      // Voitures garées le long du trottoir
      for (let t = -13; t <= 13; t += 6.5) {
        if (!rng.chance(0.3)) continue;
        const tt = t + rng.range(-0.8, 0.8);
        const p = at(b, s, PARK_LINE, tt);
        if (Math.abs(p.x) > extent - 3 || Math.abs(p.z) > extent - 3) continue;
        if (b === houseBlock && si === houseSide && Math.abs(tt - tOfHouse()) < 8) continue;
        const rot = s.rot + (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
        cars.add(p.x, 0, p.z, rot, 1, 1, 1, rng.pick(CAR_PAINTS));
        physics.addBox(p.x, 0.8, p.z, 0.9, 0.8, 2, rot);
        const hp = at(b, s, HALF + 0.25, tt);
        spots.push({ x: hp.x, y: 0, z: hp.z, kind: 'behind', label: 'derrière une voiture garée' });
        parkedCars.push({ x: p.x, z: p.z });
      }
    });
  }

  function tOfHouse(): number {
    const s = SIDES[houseSide];
    return (houseDoor.x - houseBlock.x) * s.tx + (houseDoor.z - houseBlock.z) * s.tz;
  }

  // --- Voiture du joueur, trottinette ---
  const dist = (a: { x: number; z: number }, c: { x: number; z: number }) => Math.hypot(a.x - c.x, a.z - c.z);
  const sh = dist(startBlock, houseBlock);
  const carCands = blocks.filter(
    (b) => b !== houseBlock && b !== startBlock && dist(b, startBlock) > sh * 0.35 && dist(b, houseBlock) > sh * 0.35,
  );
  const carBlock = carCands.length ? rng.pick(carCands) : blocks.find((b) => b !== startBlock && b !== houseBlock)!;
  let carSpawn: Placement = { x: 0, y: 0, z: 0, rotY: 0 };
  for (let attempt = 0; attempt < 40; attempt++) {
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

  // --- Horizon : silhouettes lointaines (sans collision) ---
  const far = new InstanceBatch(unitBox, plainMaterial(0xe0b8b0, 1), { castShadow: false, receiveShadow: false });
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2 + rng.range(-0.02, 0.02);
    const r = extent + rng.range(40, 110);
    far.add(Math.cos(a) * r, 0, Math.sin(a) * r, a, rng.range(8, 20), rng.range(10, 45), rng.range(8, 20));
  }

  for (const batch of [buildings, trims, slabs, curbs, grass, lots, stripes, benches, bins, lamps, trees, bushes, hydrants, cars, roofs, houseWalls, hedges, far]) {
    const mesh = batch.build();
    if (mesh) root.add(mesh);
  }

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
