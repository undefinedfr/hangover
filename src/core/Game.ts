import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { Input } from './Input';
import { Physics, initPhysics } from './Physics';
import { RNG } from './rng';
import { MODES, type Mode, type State } from './GameState';
import { Environment } from '../world/Environment';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';

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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.buildArena(rng);

    this.player = new Player(this.physics, rng.range(0, 100));
    this.player.swayIntensity = cfg.sway;
    this.scene.add(this.player.object);
    this.player.teleport(0, 0.1, 0);
    this.cam = new ThirdPersonCamera(this.camera, this.physics);
    this.physics.step();

    const scenePass = pass(this.scene, this.camera);
    this.pipeline = new THREE.RenderPipeline(this.renderer, scenePass);

    this.accumulator = 0;
    this.state = 'playing';
    this.input.clearPressed();
  }

  /** Arène provisoire (M1) : sol + obstacles. */
  private buildArena(rng: RNG): void {
    const physics = this.physics!;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardNodeMaterial({ color: 0x9fb07a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    physics.addBox(0, -0.5, 0, 100, 0.5, 100);
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0xe8a0bf, roughness: 0.8 });
    for (let i = 0; i < 12; i++) {
      const w = rng.range(2, 6);
      const h = rng.range(1, 8);
      const d = rng.range(2, 6);
      const x = rng.range(-40, 40);
      const z = rng.range(8, 40) * (rng.chance(0.5) ? 1 : -1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, h / 2, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      physics.addBox(x, h / 2, z, w / 2, h / 2, d / 2);
    }
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
    if (name === 'origine') {
      this.player.teleport(0, 0.1, 0);
      return true;
    }
    return false;
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
