// Page de développement : affiche le héros seul (npx vite puis /tools/hero-preview.html?yaw=0&dist=2.2&y=1.2)
import * as THREE from 'three/webgpu';
import { loadHero, REST_POSE } from '../src/player/HeroModel';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9cfe6);
scene.add(new THREE.HemisphereLight(0xd4e4ff, 0x6f6a58, 1.3));
const sun = new THREE.DirectionalLight(0xfff0dc, 3);
sun.position.set(-2, 4, 3);
sun.castShadow = true;
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardNodeMaterial({ color: 0x7a9c55 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 50);
const yaw = Number(q.get('yaw') ?? 0);
const dist = Number(q.get('dist') ?? 3.2);
const ty = Number(q.get('y') ?? 1.0);
camera.position.set(Math.sin(yaw) * dist, ty + Number(q.get('up') ?? 0.1), Math.cos(yaw) * dist);
camera.lookAt(0, ty, 0);

await renderer.init();
const hero = await loadHero();
scene.add(hero.root);
const hide = (q.get('hide') ?? '').split('|').filter(Boolean);
hero.root.traverse((o) => { if (hide.includes(o.name)) o.visible = false; });
const pose = q.get('pose') ?? 'idle';
let t = Number(q.get('t') ?? 0.3);
renderer.setAnimationLoop(() => {
  if (pose === 'walk') t += 1 / 60;
  const s = Math.sin(t * 7);
  hero.setPose(
    pose === 'walk'
      ? { ...REST_POSE, thighL: s * 0.55, thighR: -s * 0.55, kneeL: 0.1 + Math.max(0, Math.sin(t * 7 + 1.2)) * 0.9, kneeR: 0.1 + Math.max(0, Math.sin(t * 7 + 1.2 + Math.PI)) * 0.9, armL: -s * 0.4, armR: s * 0.4, elbowL: -0.35, elbowR: -0.35, lean: 0.12 }
      : { ...REST_POSE, lean: 0.08, headNod: 0.2 },
  );
  renderer.render(scene, camera);
});
(window as unknown as { ready: boolean; hero: unknown; THREE: unknown }).ready = true;
(window as unknown as { hero: unknown }).hero = hero;
(window as unknown as { THREE: unknown }).THREE = THREE;
