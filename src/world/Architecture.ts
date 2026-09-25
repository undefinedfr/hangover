import * as THREE from 'three/webgpu';
import { float, fract, fwidth, mix, uv, vec3, vertexColor, step, abs, smoothstep, mx_noise_float, positionWorld } from 'three/tsl';
import { part, merge } from './Batch';
import { GROUND_FLOOR, facadeLayout } from './Facade';
import type { RNG } from '../core/rng';
import { isLite } from '../core/Quality';

const box = new THREE.BoxGeometry(1, 1, 1);

/** Tronc de pyramide (toit) : base w×d au sol, sommet réduit de `inset`, hauteur h. */
export function frustum(w: number, d: number, h: number, inset: number, color: number): THREE.BufferGeometry {
  const a = [
    [-w / 2, 0, -d / 2],
    [w / 2, 0, -d / 2],
    [w / 2, 0, d / 2],
    [-w / 2, 0, d / 2],
  ];
  const iw = Math.max(0.05, w / 2 - inset);
  const id = Math.max(0.05, d / 2 - inset);
  const b = [
    [-iw, h, -id],
    [iw, h, -id],
    [iw, h, id],
    [-iw, h, id],
  ];
  const pos: number[] = [];
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  quad(a[1], a[0], b[0], b[1]);
  quad(a[2], a[1], b[1], b[2]);
  quad(a[3], a[2], b[2], b[3]);
  quad(a[0], a[3], b[3], b[0]);
  quad(b[0], b[3], b[2], b[1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, color);
}

/** Rectangle vertical (garde-corps, lambrequin) dont l'UV x est en mètres. */
function strip(len: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, h);
  const uvAttr = g.getAttribute('uv');
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setX(i, uvAttr.getX(i) * len);
  return g;
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  return g.applyMatrix4(m);
}

export interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  style: 0 | 1;
  /** Côtés donnant sur la rue : +x, -x, +z, -z. */
  street: { px: boolean; nx: boolean; pz: boolean; nz: boolean };
  base: number;
}

const FACES = [
  { key: 'pz', nx: 0, nz: 1, rot: 0 },
  { key: 'px', nx: 1, nz: 0, rot: Math.PI / 2 },
  { key: 'nz', nx: 0, nz: -1, rot: Math.PI },
  { key: 'nx', nx: -1, nz: 0, rot: -Math.PI / 2 },
] as const;

const AWNINGS = [0x2f6b57, 0xb23a48, 0x2d4a7a, 0xc98a2b, 0x6a3d7a];

/** Accumule toute l'architecture de la ville en quelques maillages fusionnés. */
export class ArchitectureBuilder {
  /** Géométries regroupées par tuile spatiale (pour le culling). */
  private readonly chunks = new Map<string, { solid: THREE.BufferGeometry[]; rails: THREE.BufferGeometry[]; awnings: THREE.BufferGeometry[] }>();
  private solid: THREE.BufferGeometry[] = [];
  private rails: THREE.BufferGeometry[] = [];
  private awnings: THREE.BufferGeometry[] = [];

  constructor(private readonly rng: RNG, private readonly chunkSize = 64) {}

  private select(x: number, z: number): void {
    const key = `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { solid: [], rails: [], awnings: [] };
      this.chunks.set(key, c);
    }
    this.solid = c.solid;
    this.rails = c.rails;
    this.awnings = c.awnings;
  }

  addBuilding(b: BuildingSpec, stoneColor: number): void {
    const { w, d, h, x, z, base } = b;
    this.select(x, z);
    const rng = this.rng;
    const top = base + h;
    const stone = new THREE.Color(stoneColor).multiplyScalar(1.06).getHex();
    const lay = (len: number) => facadeLayout(len, h);

    // Corniche en deux ressauts
    this.solid.push(part(box, stone, [x, top - 0.28, z], [0, 0, 0], [w + 0.5, 0.3, d + 0.5]));
    this.solid.push(part(box, stone, [x, top - 0.6, z], [0, 0, 0], [w + 0.25, 0.22, d + 0.25]));
    // Bandeau au-dessus du rez-de-chaussée
    this.solid.push(part(box, stone, [x, base + GROUND_FLOOR - 0.08, z], [0, 0, 0], [w + 0.18, 0.18, d + 0.18]));

    if (b.style === 0) {
      // Balcons filants au 2e et au dernier étage
      const L = lay(w);
      for (const fi of [1, L.floors - 1]) {
        if (fi < 1) continue;
        const y = base + GROUND_FLOOR + fi * L.floorH;
        this.solid.push(part(box, stone, [x, y, z], [0, 0, 0], [w + 1.0, 0.14, d + 1.0]));
        this.addRailingRing(x, y + 0.07, z, w + 0.96, d + 0.96, 0.95);
      }
      // Toit mansardé en zinc, brisis + terrasson
      this.solid.push(place(frustum(w + 0.1, d + 0.1, 2.9, 1.0, 0x7e8a99), x, top, z, 0));
      this.solid.push(place(frustum(w - 1.9, d - 1.9, 0.7, Math.min(w, d) / 2 - 1.2, 0x5f6975), x, top + 2.9, z, 0));
      // Lucarnes alignées sur les travées
      for (const f of FACES) {
        const len = f.nx !== 0 ? d : w;
        const cols = lay(len);
        for (let c = 0; c < cols.cols; c++) {
          if (cols.cols > 3 && c % 2 === 1) continue;
          const t = -len / 2 + (c + 0.5) * cols.colW;
          const off = (f.nx !== 0 ? w : d) / 2 - 0.5;
          const px = x + f.nx * off + (f.nz !== 0 ? t * (f.nz > 0 ? 1 : -1) : 0);
          const pz = z + f.nz * off + (f.nx !== 0 ? -t * (f.nx > 0 ? 1 : -1) : 0);
          this.addDormer(px, top + 0.2, pz, f.rot);
        }
      }
      this.addChimneys(x, top + 2.6, z, w, d, 0xe6d6bd);
    } else {
      // Faubourg : toit en tuiles à quatre pans
      this.solid.push(place(frustum(w + 0.5, d + 0.5, 2.4, Math.min(w, d) / 2 - 0.4, 0xc4694c), x, top - 0.05, z, 0));
      this.addChimneys(x, top + 1.2, z, w, d, 0xd4a07a);
    }

    // Stores bannes sur les devantures côté rue
    for (const f of FACES) {
      if (!b.street[f.key]) continue;
      const len = f.nx !== 0 ? d : w;
      const L = lay(len);
      const col = rng.pick(AWNINGS);
      for (let k = 0; k < L.bays; k++) {
        if (!rng.chance(0.55)) continue;
        const t = -len / 2 + (k + 0.5) * L.bayW;
        const off = (f.nx !== 0 ? w : d) / 2;
        const px = x + f.nx * off + (f.nz !== 0 ? t * (f.nz > 0 ? 1 : -1) : 0);
        const pz = z + f.nz * off + (f.nx !== 0 ? -t * (f.nx > 0 ? 1 : -1) : 0);
        this.addAwning(px, base + 3.05, pz, f.rot, L.bayW - 0.9, col);
      }
    }
  }

  addBox(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
    this.select(x, z);
    this.solid.push(part(box, color, [x, y, z], [0, 0, 0], [sx, sy, sz]));
  }

  private addRailingRing(x: number, y: number, z: number, w: number, d: number, h: number): void {
    const sides: Array<[number, number, number, number]> = [
      [x, z + d / 2, 0, w],
      [x, z - d / 2, Math.PI, w],
      [x + w / 2, z, Math.PI / 2, d],
      [x - w / 2, z, -Math.PI / 2, d],
    ];
    for (const [px, pz, r, len] of sides) this.rails.push(place(strip(len, h), px, y + h / 2, pz, r));
  }

  private addDormer(x: number, y: number, z: number, rot: number): void {
    const parts = [
      part(box, 0xefe3cc, [0, 0.8, 0], [0, 0, 0], [1.25, 1.6, 1.2]),
      part(box, 0x1f2633, [0, 0.75, 0.61], [0, 0, 0], [0.7, 1.05, 0.04]),
      part(box, 0xf6efe2, [0, 0.75, 0.62], [0, 0, 0], [0.06, 1.05, 0.03]),
      part(box, 0x6c7684, [0, 1.6, 0.02], [0, 0, Math.PI / 4], [0.95, 0.95, 1.34]),
    ];
    const g = merge(parts);
    this.solid.push(place(g, x, y, z, rot));
  }

  private addChimneys(x: number, y: number, z: number, w: number, d: number, color: number): void {
    const n = 1 + Math.floor(this.rng.next() * 2.5);
    for (let i = 0; i < n; i++) {
      const cx = x + this.rng.range(-w / 3, w / 3);
      const cz = z + this.rng.range(-d / 3, d / 3);
      const along = this.rng.chance(0.5);
      this.solid.push(part(box, color, [cx, y + 0.7, cz], [0, 0, 0], along ? [2.2, 1.4, 0.7] : [0.7, 1.4, 2.2]));
      this.solid.push(part(box, 0xb8a58a, [cx, y + 1.45, cz], [0, 0, 0], along ? [2.35, 0.12, 0.85] : [0.85, 0.12, 2.35]));
      for (let k = -1; k <= 1; k++) {
        this.solid.push(
          part(
            new THREE.CylinderGeometry(0.11, 0.13, 0.45, 6),
            0xd0643c,
            along ? [cx + k * 0.6, y + 1.72, cz] : [cx, y + 1.72, cz + k * 0.6],
          ),
        );
      }
    }
  }

  private addAwning(x: number, y: number, z: number, rot: number, width: number, color: number): void {
    // Toile inclinée + lambrequin, UV en mètres pour les rayures
    const slope = strip(width, 1.35);
    slope.rotateX(-Math.PI / 2 + 0.38);
    slope.translate(0, -0.25, 0.63);
    const val = strip(width, 0.28);
    val.translate(0, -0.64, 1.25);
    for (const g of [slope, val]) this.awnings.push(part(g, color, [x, y, z], [0, rot, 0], [1, 1, 1], true));
  }

  private railMaterial(): THREE.MeshStandardNodeMaterial {
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x15171c, roughness: 0.6, side: THREE.DoubleSide });
    const u = uv();
    const bars = step(0.72, fract(u.x.mul(7)));
    const rails = step(0.9, u.y).add(step(u.y, 0.05)).add(step(0.47, u.y).mul(step(u.y, 0.5)));
    // Motif en volutes simplifié : petits cercles entre les barreaux
    const ring = smoothstep(0.1, 0.07, abs(fract(u.x.mul(3.5)).sub(0.5).length().sub(0.2))).mul(step(0.55, u.y)).mul(step(u.y, 0.85));
    // Au loin, les barreaux se fondent en une densité moyenne (pas de moiré)
    const far = smoothstep(0.25, 0.8, fwidth(u.x.mul(7)));
    mat.opacityNode = mix(bars.add(rails).add(ring).clamp(0, 1), float(0.32), far);
    mat.alphaTest = 0.3;
    mat.alphaToCoverage = true;
    return mat;
  }

  private awningMaterial(): THREE.MeshStandardNodeMaterial {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    const stripe = step(0.5, fract(uv().x.mul(1.6)));
    const weave = isLite() ? float(1) : mx_noise_float(positionWorld.mul(8)).mul(0.04).add(1);
    mat.colorNode = mix(vertexColor(), vec3(0.97, 0.95, 0.9), stripe.mul(float(0.9))).mul(weave);
    return mat;
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const solidMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.82 });
    const railMat = this.railMaterial();
    const awningMat = this.awningMaterial();
    for (const c of this.chunks.values()) {
      if (c.solid.length) {
        const m = new THREE.Mesh(merge(c.solid), solidMat);
        m.castShadow = m.receiveShadow = true;
        out.push(m);
      }
      if (c.rails.length) {
        const m = new THREE.Mesh(merge(c.rails.map((g) => part(g, 0x15171c, [0, 0, 0], [0, 0, 0], [1, 1, 1], true))), railMat);
        // Pas d'ombre portée : les barreaux donneraient un motif pointillé dans la shadow map
        m.castShadow = false;
        out.push(m);
      }
      if (c.awnings.length) {
        const m = new THREE.Mesh(merge(c.awnings), awningMat);
        m.castShadow = m.receiveShadow = true;
        out.push(m);
      }
    }
    return out;
  }
}
