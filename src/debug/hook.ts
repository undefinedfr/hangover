import type { Game } from '../core/Game';
import type { Mode } from '../core/GameState';

export interface GameHook {
  readonly state: string;
  readonly mode: Mode;
  readonly seed: number;
  readonly inventory: string[];
  readonly player: { position: { x: number; y: number; z: number } };
  readonly inVehicle: string | null;
  readonly fps: number;
  readonly backend: string;
  readonly blur: number;
  readonly message: string;
  debug: {
    startGame(mode: Mode, seed: number): void;
    teleportTo(name: string): boolean;
    interact(): void;
    camera(distance: number, pitch: number, yaw?: number): void;
    teleportXYZ(x: number, y: number, z: number): void;
    footprints(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  };
}

declare global {
  interface Window {
    __game: GameHook;
  }
}

/** Hook de test en lecture : window.__game (dev et build). */
export function installHook(game: Game, start: (mode: Mode, seed: number) => void): void {
  const hook: GameHook = {
    get state() {
      return game.state === 'paused' ? 'playing' : game.state;
    },
    get mode() {
      return game.mode;
    },
    get seed() {
      return game.seed;
    },
    get inventory() {
      return game.inventoryList();
    },
    get player() {
      const p = game.playerPosition();
      return { position: { x: p.x, y: p.y, z: p.z } };
    },
    get inVehicle() {
      return game.vehicleName();
    },
    get fps() {
      return game.fps;
    },
    get backend() {
      return game.backend;
    },
    get blur() {
      return game.blurAmount();
    },
    get message() {
      return game.lastMessage;
    },
    debug: {
      startGame: (mode, seed) => start(mode, seed),
      teleportTo: (name) => game.debugTeleport(name),
      interact: () => game.input.press('KeyE'),
      teleportXYZ: (x, y, z) => {
        game.player?.teleport(x, y, z);
        game.cam?.snap();
      },
      footprints: () => game.city?.footprints.map((f) => ({ ...f })) ?? [],
      camera: (distance, pitch, yaw) => {
        if (!game.cam) return;
        game.cam.distance = distance;
        game.cam.pitch = pitch;
        if (yaw !== undefined) game.cam.yaw = yaw;
        game.cam.snap();
      },
    },
  };
  Object.defineProperty(window, '__game', { value: hook, configurable: true });
}
