import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Pièce d'un modèle composite : géométrie + couleur de sommet + transformation. */
export function part(
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
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

  add(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, color?: number | THREE.Color): void {
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.matrices.push(this.m.clone());
    this.colors.push(color instanceof THREE.Color ? color : new THREE.Color(color ?? 0xffffff));
  }

  build(): THREE.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.options.castShadow ?? true;
    mesh.receiveShadow = this.options.receiveShadow ?? true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}
