import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { Input } from './Input';
import { Physics, initPhysics } from './Physics';
import { RNG } from './rng';
import { MODES, type Mode, type State } from './GameState';
import { Environment } from '../world/Environment';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { generateCity, type City } from '../world/CityGenerator';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

export class Game {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  scene = new THREE.Scene();
  physics: Physics | null = null;
  player: Player | null = null;
  cam: ThirdPersonCamera | null = null;
  env: Environment | null = null;
  city: City | null = null;
  private pipeline: THREE.RenderPipeline | null = null;

  state: State = 'menu';
  mode: Mode = 'facile';
  seed = 0;
  fps = 0;
  backend = 'unknown';

  private accumulator = 0;
  private last = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.resize());
  }

  async init(): Promise<void> {
    await Promise.all([this.renderer.init(), initPhysics()]);
    const backend = (this.renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
    this.backend = backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  startGame(mode: Mode, seed: number): void {
    this.teardown();
    this.mode = mode;
    this.seed = seed;
    const cfg = MODES[mode];
    const rng = new RNG(seed);

    this.scene = new THREE.Scene();
    this.physics = new Physics();
    this.env = new Environment(this.scene);
    this.city = generateCity(seed, cfg.blocks, this.physics);
    this.scene.add(this.city.root);

    this.player = new Player(this.physics, rng.range(0, 100));
    this.player.swayIntensity = cfg.sway;
    this.scene.add(this.player.object);
    const st = this.city.start;
    this.player.teleport(st.x, st.y + 0.05, st.z);
    this.player.facing = st.rotY;
    this.cam = new ThirdPersonCamera(this.camera, this.physics);
    this.cam.yaw = st.rotY;
    this.physics.step();

    const scenePass = pass(this.scene, this.camera);
    this.pipeline = new THREE.RenderPipeline(this.renderer, scenePass);

    this.accumulator = 0;
    this.state = 'playing';
    this.input.clearPressed();
  }

  private teardown(): void {
    this.player?.dispose();
    this.player = null;
    this.physics?.dispose();
    this.physics = null;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }

  // --- Lecture pour le hook de test ---
  lastMessage = '';

  inventoryList(): string[] {
    return [];
  }

  playerPosition(): THREE.Vector3 {
    return this.player ? this.player.position : new THREE.Vector3();
  }

  vehicleName(): string | null {
    return null;
  }

  blurAmount(): number {
    return 0;
  }

  debugTeleport(name: string): boolean {
    if (!this.player) return false;
    const c = this.city;
    if (!c) return false;
    const places: Record<string, { x: number; y: number; z: number }> = {
      depart: c.start,
      porte: c.house.door,
      maisonRue: { x: c.house.front.x, y: 0, z: c.house.front.z },
      voitureSpawn: c.carSpawn,
      cinema: c.tricycleSpawn,
    };
    const p = places[name];
    if (!p) return false;
    this.player.teleport(p.x, p.y + 0.05, p.z);
    this.cam?.snap();
    return true;
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    if (this.state === 'playing') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
        this.fixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
    }
    this.frameUpdate(dt);

    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private fixedUpdate(dt: number): void {
    const player = this.player!;
    const cam = this.cam!;
    const axes = this.input.moveAxes();
    const fwd = cam.forward(this.tmp);
    const right = this.tmp2.set(-fwd.z, 0, fwd.x);
    let mx = fwd.x * axes.y + right.x * axes.x;
    let mz = fwd.z * axes.y + right.z * axes.x;
    const l = Math.hypot(mx, mz);
    if (l > 1) {
      mx /= l;
      mz /= l;
    }
    player.update(dt, mx, mz, this.input.run, this.input.consume('Space'));
    this.physics!.step();
  }

  private frameUpdate(dt: number): void {
    if (!this.player || !this.cam) return;
    if (this.state === 'playing') {
      const look = this.input.takeLook();
      this.cam.rotate(look.dx, look.dy);
    }
    this.player.animate(dt);
    this.cam.update(dt, this.player.position);
    this.env?.follow(this.player.position, this.camera);
  }
}
