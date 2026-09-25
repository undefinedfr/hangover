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
import { Minimap, type MapMarker } from '../ui/Minimap';
import { DrunkBlur } from '../fx/DrunkBlur';
import type { Vehicle } from '../vehicles/Vehicle';
import { Car } from '../vehicles/Car';
import { Scooter } from '../vehicles/Scooter';
import { Tricycle } from '../vehicles/Tricycle';
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
  vehicles: Vehicle[] = [];
  car: Car | null = null;
  driving: Vehicle | null = null;
  private lookIdle = 0;
  minimap: Minimap | null = null;
  minimapOn = false;
  arrivedByCar = false;
  onWin: ((time: number) => void) | null = null;
  onPauseChange: ((paused: boolean) => void) | null = null;
  onToggleMute: (() => void) | null = null;

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

  startGame(mode: Mode, seed: number, opts: { showcase?: boolean } = {}): void {
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

    const c = this.city;
    this.car = new Car(this.physics, c.carSpawn.x, c.carSpawn.y, c.carSpawn.z, c.carSpawn.rotY);
    const scooter = new Scooter(this.physics, c.scooterSpawn.x, c.scooterSpawn.y, c.scooterSpawn.z, c.scooterSpawn.rotY);
    const tricycle = new Tricycle(this.physics, c.tricycleSpawn.x, c.tricycleSpawn.y, c.tricycleSpawn.z, c.tricycleSpawn.rotY);
    this.vehicles = [this.car, scooter, tricycle];
    for (const v of this.vehicles) this.scene.add(v.object);
    this.driving = null;

    this.inventory = new Inventory();
    this.inventory.onChange = () => this.hud.updateInventory(this.inventory.list());
    this.items = spawnItems(seed, this.city, cfg);
    for (const it of this.items) this.scene.add(it.object);
    const slots: InventoryId[] = [...cfg.items, 'voiture'];
    this.hud.setup(slots);
    this.hud.updateInventory([]);
    this.hud.show(!opts.showcase);
    this.elapsed = 0;
    this.arrivedByCar = false;
    this.lastMessage = '';
    this.minimap = new Minimap(this.hud.minimap, this.city);
    // En facile, le téléphone est déjà dans ta poche : mini-carte dès le départ
    this.minimapOn = cfg.minimap === 'items';
    this.hud.showMinimap(this.minimapOn);
    if (!opts.showcase) this.message('Tu te réveilles sur un banc. Aïe. Où sont passées tes affaires ?', 6);

    this.blur = new DrunkBlur(this.renderer, this.scene, this.camera, {
      strength: cfg.blurStrength,
      sharpRadius: cfg.sharpRadius,
    });

    this.accumulator = 0;
    this.state = opts.showcase ? 'menu' : 'playing';
    if (opts.showcase) {
      this.cam.distance = 16;
      this.cam.pitch = 0.42;
    }
    this.input.clearPressed();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitPointerLock();
    this.hud.showPanel(false);
    this.onPauseChange?.(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.last = performance.now();
    this.input.clearPressed();
    this.onPauseChange?.(false);
  }

  private win(): void {
    this.state = 'won';
    this.hud.setPrompt('');
    this.hud.showPanel(false);
    this.input.exitPointerLock();
    this.onWin?.(this.elapsed);
  }

  private teardown(): void {
    this.items = [];
    for (const v of this.vehicles) v.dispose();
    this.vehicles = [];
    this.car = null;
    this.driving = null;
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
    if (code === 'Escape') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (code === 'KeyM' && this.state !== 'menu') this.onToggleMute?.();
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
    if (this.driving) {
      const v = this.driving;
      const from = { voiture: 'de la voiture', trottinette: 'de la trottinette', tricycle: 'du tricycle' }[v.name];
      return { prompt: `E Descendre ${from}`, run: () => this.exitVehicle() };
    }
    let best: Interaction | null = null;
    let bestD = INTERACT_RADIUS;
    const door = this.city!.house.door;
    const dd = Math.hypot(door.x - p.x, door.z - p.z);
    if (dd < 2.4) {
      bestD = dd - 0.5;
      best = { prompt: 'E Ouvrir la porte', run: () => this.tryOpenDoor() };
    }
    for (const v of this.vehicles) {
      const d = Math.hypot(v.position.x - p.x, v.position.z - p.z) - v.spec.half[2];
      if (d < bestD + 0.4) {
        bestD = d - 0.4;
        best = { prompt: this.vehiclePrompt(v), run: () => this.tryEnter(v) };
      }
    }
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

  /** Condition de victoire : objets requis + arrivée en voiture, puis ouvrir la porte. */
  private tryOpenDoor(): void {
    const cfg = MODES[this.mode];
    const inv = this.inventory;
    if (!inv.has('clesMaison')) {
      this.message('Fermé à clé. Tes clés de maison traînent quelque part en ville.', 4);
    } else if (!inv.has('lunettes')) {
      this.message('Impossible de viser la serrure sans tes lunettes. Tu vois trois trous.', 4);
    } else if (cfg.walletRequired && !inv.has('portefeuille')) {
      this.message('Et ton portefeuille ? Demain, sans papiers, ce sera pire.', 4);
    } else if (!inv.has('clesVoiture') || !this.arrivedByCar) {
      this.message("Et la voiture ? Tu ne vas pas la laisser là-bas. Va la chercher et gare-toi devant.", 4.5);
    } else {
      this.message('Clic. La porte s\'ouvre. Ton lit est là, rien que pour toi.', 5);
      this.win();
    }
  }

  private vehiclePrompt(v: Vehicle): string {
    if (v.name === 'voiture') return this.inventory.has('clesVoiture') ? 'E Monter dans la voiture' : 'E Ouvrir la voiture';
    if (v.name === 'trottinette') return 'E Monter sur la trottinette';
    return 'E Enfourcher le tricycle';
  }

  private tryEnter(v: Vehicle): void {
    const cfg = MODES[this.mode];
    if (v.name === 'voiture') {
      if (!this.inventory.has('clesVoiture')) {
        this.message("C'est fermé. Évidemment.", 3);
        return;
      }
      if (cfg.walletRequired && !this.inventory.has('portefeuille')) {
        this.message('Sans papiers, pas de volant. Ton portefeuille traîne forcément quelque part.', 4);
        return;
      }
      if (!this.inventory.has('voiture')) {
        this.inventory.add('voiture');
        this.message('Ta voiture ! Avec un cône de chantier sur le toit. Aucun souvenir de ça.', 4.5);
      }
    }
    this.enterVehicle(v);
  }

  enterVehicle(v: Vehicle): void {
    const player = this.player!;
    this.driving = v;
    v.driven = true;
    player.setActive(false);
    player.pose = v.spec.pose;
    player.speed = 0;
    this.cam!.distance = v.spec.cameraDistance;
    this.onVehicleChange?.(v);
  }

  exitVehicle(): void {
    const v = this.driving;
    if (!v) return;
    const player = this.player!;
    v.speed = 0;
    v.driven = false;
    this.driving = null;
    let spot: THREE.Vector3 | null = null;
    for (const c of v.exitCandidates()) {
      if (!this.physics!.capsuleBlocked(c.x, v.position.y + 0.1 + PLAYER_CENTER, c.z, 0.5, 0.36)) {
        spot = c;
        break;
      }
    }
    // En dernier recours : sur le toit, la gravité fera le reste
    spot ??= v.position.clone().setY(v.position.y + v.spec.half[1] * 2 + 0.3);
    player.pose = 'walk';
    player.setActive(true);
    player.teleport(spot.x, Math.max(spot.y, v.position.y) + 0.05, spot.z);
    player.facing = v.yaw;
    this.cam!.distance = 5.5;
    this.onVehicleChange?.(null);
  }

  onVehicleChange: ((v: Vehicle | null) => void) | null = null;

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
    if (id === 'telephone') {
      if (cfg.minimap === 'none') {
        setTimeout(() => this.state === 'playing' && this.message('Écran fissuré, 1 % de batterie. Pas de carte pour toi.', 4), 4600);
      } else {
        this.minimapOn = true;
        this.hud.showMinimap(true);
        setTimeout(() => this.state === 'playing' && this.message('Le GPS indique ta voiture et ta maison. Merci la technologie.', 4), 4600);
      }
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
    return this.driving ? this.driving.name : null;
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
    const vehicle = this.vehicles.find((v) => v.name === name);
    if (vehicle) {
      if (this.driving) this.exitVehicle();
      const spot = this.freeSpotNear(vehicle.position.x, vehicle.position.z, [vehicle.spec.half[2] + 0.9, vehicle.spec.half[2] + 1.6, 3.5]);
      this.player.teleport(spot.x, spot.y, spot.z);
      this.cam?.snap();
      return true;
    }
    if (name === 'maison') {
      if (this.driving) {
        const s = this.freeSpotNear(c.house.front.x, c.house.front.z, [0, 2, 4, 6]);
        const dx = c.house.door.x - c.house.front.x;
        const dz = c.house.door.z - c.house.front.z;
        // Garé le long de la rue, parallèle au trottoir
        this.driving.place(s.x, 0.05, s.z, Math.atan2(dx, dz) + Math.PI / 2);
      } else {
        this.player.teleport(c.house.door.x, c.house.door.y + 0.05, c.house.door.z);
      }
      this.cam?.snap();
      return true;
    }
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

  private mapMarkers(): MapMarker[] {
    const cfg = MODES[this.mode];
    const c = this.city!;
    const out: MapMarker[] = [{ x: c.house.door.x, z: c.house.door.z, kind: 'house' }];
    if (this.car && this.driving !== this.car) out.push({ x: this.car.position.x, z: this.car.position.z, kind: 'car' });
    if (cfg.minimap === 'items') {
      for (const it of this.items) if (!it.collected) out.push({ x: it.position.x, z: it.position.z, kind: 'item' });
    }
    return out;
  }

  isOnCarpet(p: THREE.Vector3): boolean {
    return !!this.city?.carpets.some((r) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);
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
    const v = this.driving;
    if (v) {
      v.drive(dt, axes.y, -axes.x, this.input.isDown('Space'));
      (v as Vehicle & { steerVisual: number }).steerVisual = -axes.x;
      const seat = v.seatPosition(this.tmp);
      player.teleport(seat.x, seat.y, seat.z);
      player.facing = v.yaw;
      player.speed = 0;
      player.pedalSpeed = v.speed / 0.27;
      this.input.consume('Space');
    } else {
      player.update(dt, mx, mz, this.input.run, this.input.consume('Space'));
    }
    for (const other of this.vehicles) {
      if (other !== v) other.idle(dt);
      other.onCarpet = this.isOnCarpet(other.position);
    }
    this.physics!.step();
    this.elapsed += dt;

    if (v && v === this.car && !this.arrivedByCar) {
      const f = this.city!.house.front;
      if (Math.hypot(v.position.x - f.x, v.position.z - f.z) < 14) {
        this.arrivedByCar = true;
        this.message('Te voilà devant chez toi ! Descends et ouvre la porte (E).', 5);
      }
    }

    const interaction = this.findInteraction();
    this.currentPrompt = interaction?.prompt ?? '';
    if (this.input.consume('KeyE') && interaction) interaction.run();
  }

  private frameUpdate(dt: number): void {
    if (!this.player || !this.cam) return;
    if (this.state === 'playing') {
      const look = this.input.takeLook();
      this.cam.rotate(look.dx, look.dy);
      this.lookIdle = look.dx !== 0 || look.dy !== 0 ? 0 : this.lookIdle + dt;
      // En véhicule, la caméra se replace doucement derrière
      const v = this.driving;
      if (v && this.lookIdle > 0.8 && Math.abs(v.speed) > 1) {
        let d = v.yaw - this.cam.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.cam.yaw += d * Math.min(1, dt * 2.5);
      }
    }
    if (this.state === 'menu') {
      // Écran d'accueil : lente orbite autour du banc
      this.cam.yaw += dt * 0.12;
    }
    for (const v of this.vehicles) v.animate(dt);
    this.player.animate(dt);
    if (this.minimapOn && this.minimap && this.state === 'playing') {
      this.minimap.draw(dt, this.player.position.x, this.player.position.z, this.player.facing, this.mapMarkers());
    }
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
