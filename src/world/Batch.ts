import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Couleur spéciale : conserver les couleurs de sommet déjà présentes. */
export const KEEP_COLORS = -1;

/** Pièce d'un modèle composite : géométrie + couleur de sommet + transformation. */
export function part(
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  keepUV = false,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!keepUV) g.deleteAttribute('uv');
  if (keepUV && !g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  if (color === KEEP_COLORS && g.getAttribute('color')) return g;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries a échoué');
  g.computeBoundingSphere();
  return g;
}

/** Accumule des instances puis construit un InstancedMesh (un seul appel de dessin). */
export class InstanceBatch {
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly colors: THREE.Color[] = [];
  /** Attributs par instance supplémentaires (ex. taille du bâtiment, style). */
  private readonly extras = new Map<string, number[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly options: { castShadow?: boolean; receiveShadow?: boolean } = {},
  ) {}

  get count(): number {
    return this.matrices.length;
  }

  add(
    x: number,
    y: number,
    z: number,
    rotY = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    color?: number | THREE.Color,
    extra?: Record<string, number[]>,
  ): void {
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (!this.extras.has(k)) this.extras.set(k, []);
        this.extras.get(k)!.push(...v);
      }
    }
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.matrices.push(this.m.clone());
    this.colors.push(color instanceof THREE.Color ? color : new THREE.Color(color ?? 0xffffff));
  }

  /** Tableaux des attributs supplémentaires (pour construire le matériau). */
  extraArray(name: string): Float32Array {
    return new Float32Array(this.extras.get(name) ?? []);
  }

  /**
   * Construit des InstancedMesh découpés en tuiles spatiales de `chunk` mètres : chaque tuile a
   * sa propre sphère englobante, donc la caméra et la carte d'ombres peuvent l'écarter.
   * `material` peut être une fabrique recevant les attributs supplémentaires de la tuile.
   */
  build(
    material?: THREE.Material | ((extras: Record<string, Float32Array>) => THREE.Material),
    chunk = 64,
  ): THREE.Object3D | null {
    const n = this.matrices.length;
    if (n === 0) return null;
    const groups = new Map<string, number[]>();
    const p = new THREE.Vector3();
    this.matrices.forEach((m, i) => {
      p.setFromMatrixPosition(m);
      const key = `${Math.floor(p.x / chunk)},${Math.floor(p.z / chunk)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    const root = new THREE.Group();
    for (const ids of groups.values()) {
      const extras: Record<string, Float32Array> = {};
      for (const [k, v] of this.extras) {
        const size = v.length / n;
        const arr = new Float32Array(ids.length * size);
        ids.forEach((id, j) => {
          for (let c = 0; c < size; c++) arr[j * size + c] = v[id * size + c];
        });
        extras[k] = arr;
      }
      const mat = typeof material === 'function' ? material(extras) : (material ?? this.material);
      // Attributs supplémentaires : portés par une copie de la géométrie propre à la tuile
      let geometry = this.geometry;
      if (this.extras.size > 0) {
        geometry = this.geometry.clone();
        for (const [k, arr] of Object.entries(extras)) {
          geometry.setAttribute(k, new THREE.InstancedBufferAttribute(arr, arr.length / ids.length));
        }
      }
      const mesh = new THREE.InstancedMesh(geometry, mat, ids.length);
      ids.forEach((id, j) => {
        mesh.setMatrixAt(j, this.matrices[id]);
        mesh.setColorAt(j, this.colors[id]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = this.options.castShadow ?? true;
      mesh.receiveShadow = this.options.receiveShadow ?? true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
    return root;
  }
}
