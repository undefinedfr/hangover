import './style.css';
import { Game } from './core/Game';
import { installHook } from './debug/hook';
import { isMode, type Mode } from './core/GameState';
import { randomSeed } from './core/rng';

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function showFatal(title: string, detail: string): void {
  const el = document.getElementById('fatal')!;
  el.querySelector('h2')!.textContent = title;
  el.querySelector('p')!.textContent = detail;
  el.hidden = false;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!('gpu' in navigator) && !hasWebGL2()) {
    showFatal(
      'Ton navigateur a encore plus mal au crâne que toi',
      "Ce jeu a besoin de WebGPU ou WebGL2, et ton navigateur ne propose ni l'un ni l'autre. Essaie une version récente de Chrome, Edge, Firefox ou Safari.",
    );
    return;
  }

  const game = new Game(canvas);
  try {
    await game.init();
  } catch (err) {
    console.warn(err);
    showFatal(
      'Impossible de démarrer le rendu 3D',
      "WebGPU et WebGL2 ont refusé de se lever ce matin. Mets à jour ton navigateur ou active l'accélération matérielle.",
    );
    return;
  }

  const params = new URLSearchParams(location.search);
  const urlSeed = Number(params.get('seed'));
  const urlMode = params.get('mode');

  const start = (mode: Mode, seed: number) => {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
    game.startGame(mode, seed);
  };
  installHook(game, start);

  if (params.has('autostart')) {
    start(isMode(urlMode) ? urlMode : 'facile', Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : randomSeed());
  }
  canvas.addEventListener('click', () => game.input.requestPointerLock());
}

void boot();
