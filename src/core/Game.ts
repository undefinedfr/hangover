import * as THREE from 'three/webgpu';
import { Input } from './Input';
import { Physics, initPhysics } from './Physics';
import { RNG } from './rng';
import { MODES, type Mode, type State } from './GameState';
import { Environment } from '../world/Environment';
import { Player, PLAYER_CENTER } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { generateCity, type City } from '../world/CityGenerator';
import { Item } from '../items/Item';
import { spawnItems, pickupMessage } from '../items/ItemSpawner';
import { Inventory } from '../items/Inventory';
import { HUD } from '../ui/HUD';
import { DrunkBlur } from '../fx/DrunkBlur';
import { ITEM_LABELS, type InventoryId, type ItemId } from './GameState';

const INTERACT_RADIUS = 1.9;

interface Interaction {
  prompt: string;
  run: () => void;
}

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
  blur: DrunkBlur | null = null;
  readonly hud: HUD;
  items: Item[] = [];
  inventory = new Inventory();
  elapsed = 0;

  state: State = 'menu';
  mode: Mode = 'facile';
  seed = 0;
  fps = 0;
  backend = 'unknown';

  private currentPrompt = '';
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
    this.hud = new HUD(document.getElementById('ui')!);
    this.input.onKey = (code, e) => this.onKey(code, e);
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
    this.cam.sway = cfg.sway;
    this.physics.step();

    this.inventory = new Inventory();
    this.inventory.onChange = () => this.hud.updateInventory(this.inventory.list());
    this.items = spawnItems(seed, this.city, cfg);
    for (const it of this.items) this.scene.add(it.object);
    const slots: InventoryId[] = [...cfg.items, 'voiture'];
    this.hud.setup(slots);
    this.hud.updateInventory([]);
    this.hud.show(true);
    this.elapsed = 0;
    this.lastMessage = '';
    this.message('Tu te réveilles sur un banc. Aïe. Où sont passées tes affaires ?', 6);

    this.blur = new DrunkBlur(this.renderer, this.scene, this.camera, {
      strength: cfg.blurStrength,
      sharpRadius: cfg.sharpRadius,
    });

    this.accumulator = 0;
    this.state = 'playing';
    this.input.clearPressed();
  }

  private teardown(): void {
    this.items = [];
    this.player?.dispose();
    this.player = null;
    this.physics?.dispose();
    this.physics = null;
    this.blur?.dispose();
    this.blur = null;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }

  message(text: string, seconds?: number): void {
    this.lastMessage = text;
    this.hud.message(text, seconds);
  }

  private onKey(code: string, e: KeyboardEvent): void {
    if (this.state !== 'playing') return;
    if (code === 'Tab') {
      e.preventDefault();
      this.hud.togglePanel();
    }
  }

  /** Interaction la plus proche du joueur (objet, véhicule, porte…). */
  private findInteraction(): Interaction | null {
    const player = this.player!;
    const p = player.position;
    let best: Interaction | null = null;
    let bestD = INTERACT_RADIUS;
    for (const it of this.items) {
      if (it.collected) continue;
      const d = Math.hypot(it.position.x - p.x, it.position.z - p.z);
      if (d < bestD && Math.abs(it.position.y - p.y) < 2) {
        bestD = d;
        best = { prompt: `E Ramasser : ${ITEM_LABELS[it.id].toLowerCase()}`, run: () => this.collect(it) };
      }
    }
    return best;
  }

  private collect(it: Item): void {
    it.collect();
    this.inventory.add(it.id);
    this.message(pickupMessage(it.id, it.label));
    this.onCollected(it.id);
  }

  /** Effets de gameplay d'un ramassage. */
  private onCollected(id: ItemId): void {
    const cfg = MODES[this.mode];
    if (id === 'lunettes') {
      this.blur?.clear();
      this.player?.wearGlasses();
    }
    // « Tu reprends tes esprits » : le titubement diminue
    const recovered = cfg.walletRequired
      ? this.inventory.has('telephone') && this.inventory.has('portefeuille')
      : this.inventory.has('lunettes');
    if (recovered && this.player) {
      this.player.swayIntensity = cfg.sway * 0.3;
      if (this.cam) this.cam.sway = cfg.sway * 0.3;
      if (id !== 'lunettes' || !cfg.walletRequired) {
        setTimeout(() => this.state === 'playing' && this.message('Tu reprends tes esprits. Tu marches presque droit.', 3.5), 4600);
      }
    }
  }

  // --- Lecture pour le hook de test ---
  lastMessage = '';

  inventoryList(): string[] {
    return this.inventory.list();
  }

  playerPosition(): THREE.Vector3 {
    return this.player ? this.player.position : new THREE.Vector3();
  }

  vehicleName(): string | null {
    return null;
  }

  blurAmount(): number {
    return this.blur ? this.blur.value : 0;
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
    const item = this.items.find((it) => it.id === name && !it.collected);
    if (item) {
      const spot = this.freeSpotNear(item.position.x, item.position.z, [0.9, 1.3, 1.6]);
      this.player.teleport(spot.x, spot.y, spot.z);
      this.cam?.snap();
      return true;
    }
    const p = places[name];
    if (!p) return false;
    this.player.teleport(p.x, p.y + 0.05, p.z);
    this.cam?.snap();
    return true;
  }

  /** Position libre (capsule du joueur hors du décor) autour d'un point. */
  freeSpotNear(x: number, z: number, radii: number[]): THREE.Vector3 {
    const physics = this.physics!;
    for (const r of radii) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const y = 0.25;
        if (!physics.capsuleBlocked(px, y + PLAYER_CENTER, pz, 0.5, 0.36)) return new THREE.Vector3(px, y, pz);
      }
    }
    return new THREE.Vector3(x, 1.5, z);
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

    if (this.blur) this.blur.render();
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
    this.elapsed += dt;

    const interaction = this.findInteraction();
    this.currentPrompt = interaction?.prompt ?? '';
    if (this.input.consume('KeyE') && interaction) interaction.run();
  }

  private frameUpdate(dt: number): void {
    if (!this.player || !this.cam) return;
    if (this.state === 'playing') {
      const look = this.input.takeLook();
      this.cam.rotate(look.dx, look.dy);
    }
    this.player.animate(dt);
    for (const it of this.items) it.update(dt, this.camera, this.player.position);
    this.hud.setPrompt(this.state === 'playing' ? this.currentPrompt : '');
    this.hud.setTime(this.elapsed);
    this.hud.update(dt);
    this.cam.update(dt, this.player.position);
    this.env?.follow(this.player.position, this.camera);
    this.camera.updateMatrixWorld();
    this.blur?.update(dt, this.player.position);
  }
}
