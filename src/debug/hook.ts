import type { Game } from '../core/Game';
import type { Mode } from '../core/GameState';

type P = { x: number; z: number };

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
  /** Derniers messages affichés (le plus récent en dernier). */
  readonly messages: string[];
  /** Invite d'interaction courante (« E Ramasser : … »). */
  readonly prompt: string;
  debug: {
    startGame(mode: Mode, seed: number): void;
    teleportTo(name: string): boolean;
    interact(): void;
    camera(distance: number, pitch: number, yaw?: number): void;
    teleportXYZ(x: number, y: number, z: number): void;
    elapsed(): number;
    stats(): { triangles: number; calls: number };
    budget(): Array<{ name: string; tris: number; count: number }>;
    layout(): { start: P; house: P; car: P; items: Array<P & { id: string }> };
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
    get messages() {
      return [...game.messageLog];
    },
    get prompt() {
      return game.prompt;
    },
    debug: {
      startGame: (mode, seed) => start(mode, seed),
      teleportTo: (name) => game.debugTeleport(name),
      interact: () => game.input.press('KeyE'),
      elapsed: () => game.elapsed,
      budget: () => {
        const out: Array<{ name: string; tris: number; count: number }> = [];
        game.scene.traverse((o) => {
          const m = o as unknown as { isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } } }; count?: number; isInstancedMesh?: boolean };
          if (!m.isMesh || !m.geometry) return;
          const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
          const n = m.isInstancedMesh ? (m.count ?? 1) : 1;
          const name = m.isInstancedMesh ? `inst${t.toFixed(0)}` : `mesh`;
          const prev = out.find((o) => o.name === name);
          if (prev) {
            prev.tris += t * n;
            prev.count += n;
          } else out.push({ name, tris: t * n, count: n });
        });
        return out.sort((a, b) => b.tris - a.tris).slice(0, 15);
      },
      stats: () => {
        const r = game.renderer.info.render as unknown as { triangles: number; drawCalls?: number; calls?: number };
        return { triangles: r.triangles, calls: r.drawCalls ?? r.calls ?? 0 };
      },
      layout: () => {
        const c = game.city!;
        return {
          start: { x: c.start.x, z: c.start.z },
          house: { x: c.house.door.x, z: c.house.door.z },
          car: { x: c.carSpawn.x, z: c.carSpawn.z },
          items: game.items.map((it) => ({ id: it.id, x: it.position.x, z: it.position.z })),
        };
      },
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
