import './style.css';
import { Game } from './core/Game';
import { installHook } from './debug/hook';
import { isMode, type Mode } from './core/GameState';
import { randomSeed } from './core/rng';
import { Menu, EndScreen, PauseScreen, saveBest, loadBest } from './ui/Screens';

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
      "Ce jeu a besoin de WebGPU ou de WebGL2, et ton navigateur ne propose ni l'un ni l'autre. Essaie une version récente de Chrome, Edge, Firefox ou Safari.",
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

  const ui = document.getElementById('ui')!;
  const menu = new Menu(ui);
  const end = new EndScreen(ui);
  const pause = new PauseScreen(ui);

  const params = new URLSearchParams(location.search);
  const urlSeed = Number(params.get('seed'));
  let pendingSeed = Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : null;
  const urlMode = params.get('mode');

  const setUrl = (mode: Mode, seed: number) => {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
  };

  const start = (mode: Mode, seed: number) => {
    menu.show(false);
    end.show(null);
    pause.show(false);
    setUrl(mode, seed);
    game.startGame(mode, seed);
  };

  const showMenu = () => {
    end.show(null);
    pause.show(false);
    game.startGame('facile', pendingSeed ?? 20240, { showcase: true });
    menu.show(true);
  };

  menu.onPlay = (mode) => {
    const seed = pendingSeed ?? randomSeed();
    pendingSeed = null;
    start(mode, seed);
    game.input.requestPointerLock();
  };
  end.onReplay = () => {
    start(game.mode, randomSeed());
    game.input.requestPointerLock();
  };
  end.onSameCity = () => {
    start(game.mode, game.seed);
    game.input.requestPointerLock();
  };
  end.onMenu = showMenu;
  pause.onResume = () => {
    game.resume();
    game.input.requestPointerLock();
  };
  pause.onRestart = () => {
    start(game.mode, game.seed);
    game.input.requestPointerLock();
  };
  pause.onMenu = showMenu;

  game.onPauseChange = (p) => pause.show(p);
  game.hud.onPause = () => game.pause();
  game.onWin = (time) => {
    const record = saveBest(game.mode, time);
    end.show({ time, mode: game.mode, seed: game.seed, record, best: loadBest()[game.mode] });
  };

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.state === 'playing') game.pause();
  });
  canvas.addEventListener('click', () => {
    if (game.state === 'playing') game.input.requestPointerLock();
  });

  installHook(game, start);
  showMenu();
  if (isMode(urlMode)) menu.select(urlMode);
}

void boot();
