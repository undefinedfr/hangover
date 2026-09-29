import './style.css';
import { Game } from './core/Game';
import { installHook } from './debug/hook';
import { isMode, type Mode } from './core/GameState';
import { randomSeed } from './core/rng';
import { Menu, EndScreen, PauseScreen, saveBest, loadBest } from './ui/Screens';
import { boot as bootScreen, nextPaint } from './ui/boot';

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function hideLoading(): void {
  bootScreen.hide();
  document.getElementById('loading')?.setAttribute('hidden', '');
}

function showFatal(title: string, detail: string): void {
  hideLoading();
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

  bootScreen.creep(0.74, 'Réveil de la carte graphique…', 3);
  const game = new Game(canvas);
  try {
    await game.init();
    bootScreen.set(0.75, 'Construction du quartier…');
    await nextPaint();
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

  // La vraie partie du niveau choisi se prépare derrière le menu : « Jouer » la lance sans
  // nouveau chargement. Changer de niveau la reconstruit discrètement (bouton « Préparation… »).
  let menuSeed = 0;
  let prepId = 0;
  let playWhenReady = false;
  const prepare = async (mode: Mode, quiet: boolean) => {
    const id = ++prepId;
    menu.setPreparing(true);
    if (quiet) await nextPaint(); // affiche « Préparation… » avant le calcul synchrone
    if (id !== prepId) return;
    game.startGame(mode, menuSeed, { showcase: true, quiet });
  };
  const launch = () => {
    playWhenReady = false;
    pendingSeed = null;
    menu.show(false);
    setUrl(game.mode, game.seed);
    game.play();
  };
  game.onReady = () => {
    if (game.state !== 'menu') return;
    menu.setPreparing(false);
    if (playWhenReady && game.mode === menu.mode) launch();
  };

  const showMenu = () => {
    end.show(null);
    pause.show(false);
    menuSeed = pendingSeed ?? randomSeed();
    playWhenReady = false;
    menu.show(true);
    void prepare(menu.mode, false);
  };

  menu.onSelect = (mode) => void prepare(mode, true);
  menu.onPlay = (mode) => {
    if (game.state === 'menu' && game.mode === mode) {
      launch();
      game.input.requestPointerLock();
    } else {
      // Ville encore en préparation : la partie démarre dès qu'elle est prête
      playWhenReady = true;
    }
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
  if (isMode(urlMode)) menu.select(urlMode);
  showMenu();
}

void boot();
