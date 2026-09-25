import * as THREE from 'three/webgpu';
import { uv, vec2, fract, floor, length, smoothstep, mix, color, hash, float, step } from 'three/tsl';
import { part, merge } from '../world/Batch';

const lathe = (pts: Array<[number, number]>, seg = 14) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), seg);

/** Chemise hawaïenne (c'était une soirée à thème) : fond corail, fleurs et feuilles. */
function shirtMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const st = uv().mul(vec2(10, 6));
  const row = floor(st.y);
  const cell = vec2(fract(st.x.add(row.mul(0.5))), fract(st.y)).sub(0.5);
  const id = hash(floor(st.x.add(row.mul(0.5))).add(row.mul(17)));
  const r = length(cell);
  const petal = smoothstep(0.3, 0.24, r);
  const heart = smoothstep(0.1, 0.06, r);
  const leafCell = vec2(fract(st.x.add(row.mul(0.5)).add(0.5)), fract(st.y.add(0.5))).sub(0.5);
  const leaf = smoothstep(0.2, 0.14, length(leafCell.mul(vec2(1, 2.4))));
  const flowerCol = mix(color(0xffd24a), color(0xfff4e0), step(0.5, id));
  let c = mix(color(0xff6f59), color(0x2f9c8a), leaf.mul(0.9));
  c = mix(c, flowerCol, petal);
  c = mix(c, color(0xe8504a), heart);
  mat.colorNode = c.mul(float(1));
  return mat;
}

export interface CharacterParts {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

/** Personnage : proportions cartoon, chemise hawaïenne, jean, baskets, cravate sur la tête. */
export function buildCharacter(): CharacterParts {
  const skin = 0xf0c09a;
  const skinMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75 });
  const shirt = shirtMaterial();
  const cast = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // --- Buste ---
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  const chestGeo = lathe([
    [0.001, -0.27],
    [0.215, -0.27],
    [0.228, -0.2],
    [0.205, 0.0],
    [0.238, 0.24],
    [0.242, 0.35],
    [0.2, 0.45],
    [0.1, 0.51],
    [0.075, 0.55],
  ]);
  chestGeo.scale(1, 1, 0.72);
  torso.add(cast(new THREE.Mesh(chestGeo, shirt)));
  const body = merge([
    // Haut du jean sous la chemise
    part(lathe([[0.2, -0.36], [0.212, -0.24]]), 0x34496e),
    // Cou
    part(new THREE.CylinderGeometry(0.06, 0.065, 0.14, 10), skin, [0, 0.58, 0]),
    // Col de chemise ouvert
    part(new THREE.BoxGeometry(0.1, 0.07, 0.02), 0xffe0cc, [-0.06, 0.52, 0.12], [0.3, 0.5, -0.4]),
    part(new THREE.BoxGeometry(0.1, 0.07, 0.02), 0xffe0cc, [0.06, 0.52, 0.12], [0.3, -0.5, 0.4]),
    // Boutons
    ...[0.35, 0.2, 0.05, -0.1].map((y) => part(new THREE.SphereGeometry(0.012, 5, 4), 0xfff4e0, [0, y, 0.175])),
  ]);
  torso.add(cast(new THREE.Mesh(body, skinMat)));

  // --- Tête ---
  const head = new THREE.Group();
  head.position.y = 0.76;
  const hair = 0x4a3222;
  const headParts: THREE.BufferGeometry[] = [
    part(new THREE.SphereGeometry(0.19, 18, 14), skin, [0, 0, 0], [0, 0, 0], [0.95, 1.05, 1]),
    part(new THREE.SphereGeometry(0.15, 14, 10), skin, [0, -0.07, 0.03], [0, 0, 0], [1, 0.9, 1]),
    // Nez un peu rouge (lendemain de fête)
    part(new THREE.SphereGeometry(0.042, 10, 8), 0xf0a084, [0, -0.02, 0.19], [0, 0, 0], [1, 0.9, 1.25]),
    // Oreilles
    part(new THREE.SphereGeometry(0.05, 8, 6), skin, [-0.18, -0.01, 0], [0, 0, 0], [0.45, 1, 0.75]),
    part(new THREE.SphereGeometry(0.05, 8, 6), skin, [0.18, -0.01, 0], [0, 0, 0], [0.45, 1, 0.75]),
    // Yeux mi-clos, cernes, sourcils de travers
    part(new THREE.SphereGeometry(0.03, 8, 6), 0x2b2b3a, [-0.07, 0.035, 0.165], [0, 0, 0], [1, 0.45, 0.6]),
    part(new THREE.SphereGeometry(0.03, 8, 6), 0x2b2b3a, [0.07, 0.035, 0.165], [0, 0, 0], [1, 0.45, 0.6]),
    part(new THREE.SphereGeometry(0.035, 8, 6), 0xd9a3a0, [-0.07, 0.005, 0.158], [0, 0, 0], [1.1, 0.45, 0.5]),
    part(new THREE.SphereGeometry(0.035, 8, 6), 0xd9a3a0, [0.07, 0.005, 0.158], [0, 0, 0], [1.1, 0.45, 0.5]),
    part(new THREE.BoxGeometry(0.07, 0.016, 0.02), hair, [-0.07, 0.085, 0.165], [0, 0, 0.25]),
    part(new THREE.BoxGeometry(0.07, 0.016, 0.02), hair, [0.07, 0.078, 0.165], [0, 0, -0.1]),
    // Bouche : petite moue
    part(new THREE.BoxGeometry(0.06, 0.012, 0.02), 0x9a4f4a, [0.01, -0.1, 0.165], [0, 0, 0.12]),
  ];
  // Cheveux en bataille : touffes irrégulières sur le dessus et l'arrière
  const tufts: Array<[number, number, number, number]> = [
    [0, 0.13, -0.02, 0.12],
    [0.08, 0.12, 0.04, 0.08],
    [-0.09, 0.12, 0.03, 0.085],
    [0.03, 0.16, 0.07, 0.07],
    [-0.04, 0.1, -0.11, 0.11],
    [0.1, 0.07, -0.09, 0.08],
    [-0.12, 0.06, -0.07, 0.08],
    [0.06, 0.19, -0.03, 0.06],
    [-0.02, 0.17, 0.1, 0.05],
  ];
  for (const [x, y, z, r] of tufts) {
    headParts.push(part(new THREE.IcosahedronGeometry(r, 0), hair, [x, y, z], [x * 9, y * 7, z * 11]));
  }
  head.add(cast(new THREE.Mesh(merge(headParts), skinMat)));
  // Cravate nouée autour du front : souvenir de la soirée
  const tieMat = new THREE.MeshStandardNodeMaterial({ color: 0x5dd39e, roughness: 0.55 });
  const band = cast(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 20), tieMat));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.075;
  band.scale.set(1, 1.05, 1);
  head.add(band);
  const knot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), tieMat));
  knot.position.set(0.06, 0.07, -0.19);
  head.add(knot);
  for (const [dx, rz] of [
    [0.02, 0.4],
    [0.1, -0.3],
  ]) {
    const tail = cast(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.012), tieMat));
    tail.position.set(0.04 + dx * 0.6, 0.01, -0.2);
    tail.rotation.set(-0.5, 0, rz);
    head.add(tail);
  }
  torso.add(head);

  // --- Bras : manche courte + avant-bras + main ---
  const arm = (sign: number) => {
    const g = new THREE.Group();
    g.position.set(sign * 0.29, 0.4, 0);
    const sleeve = new THREE.CylinderGeometry(0.075, 0.085, 0.22, 10, 1, true);
    sleeve.translate(0, -0.09, 0);
    g.add(cast(new THREE.Mesh(sleeve, shirt)));
    const limb = merge([
      part(new THREE.CapsuleGeometry(0.052, 0.34, 4, 8), skin, [0, -0.33, 0]),
      part(new THREE.SphereGeometry(0.062, 10, 8), skin, [0, -0.56, 0.01], [0, 0, 0], [0.85, 1.1, 0.7]),
      part(new THREE.SphereGeometry(0.03, 8, 6), skin, [sign * -0.035, -0.53, 0.04]),
      // Bracelet de soirée fluo
      part(new THREE.TorusGeometry(0.056, 0.012, 4, 12), 0xd6ff3a, [0, -0.47, 0], [Math.PI / 2, 0, 0]),
    ]);
    g.add(cast(new THREE.Mesh(limb, skinMat)));
    return g;
  };

  // --- Jambes : jean fuselé + basket ---
  const leg = (sign: number) => {
    const g = new THREE.Group();
    g.position.set(sign * 0.11, 0.74, 0);
    const jean = lathe(
      [
        [0.001, 0.02],
        [0.1, 0.02],
        [0.1, -0.1],
        [0.085, -0.34],
        [0.08, -0.6],
        [0.084, -0.66],
      ],
      10,
    );
    const shoe = merge([
      part(new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), 0xe9e4da, [0, -0.69, 0.05], [Math.PI / 2, 0, 0], [1, 1, 0.8]),
      part(new THREE.BoxGeometry(0.13, 0.03, 0.28), 0xb8453e, [0, -0.735, 0.05]),
      part(new THREE.BoxGeometry(0.09, 0.02, 0.1), 0x2d3646, [0, -0.66, 0.1]),
    ]);
    g.add(cast(new THREE.Mesh(merge([part(jean, 0x34496e), shoe]), skinMat)));
    return g;
  };

  const armL = arm(-1);
  const armR = arm(1);
  torso.add(armL, armR);
  return { torso, head, armL, armR, legL: leg(-1), legR: leg(1) };
}
