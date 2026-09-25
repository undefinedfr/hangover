import { MODES, type Mode } from '../core/GameState';
import { formatTime } from './HUD';

const BEST_KEY = 'gueule-de-bois.best.v1';

export function loadBest(): Partial<Record<Mode, number>> {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<Mode, number>>) : {};
  } catch {
    return {};
  }
}

/** Enregistre un temps ; renvoie vrai si c'est un record. */
export function saveBest(mode: Mode, seconds: number): boolean {
  const best = loadBest();
  const prev = best[mode];
  if (prev !== undefined && prev <= seconds) return false;
  best[mode] = seconds;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* stockage indisponible : tant pis pour le record */
  }
  return true;
}

const MODE_BLURB: Record<Mode, string> = {
  facile: 'Petite ville, tout est en évidence. Le téléphone est déjà dans ta poche.',
  normal: 'Tout a disparu. Cherche derrière le mobilier urbain.',
  hardcore: 'Grande ville, flou violent, aucune aide. Poubelles comprises.',
};

function el<T extends HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

/** Menu d'accueil. */
export class Menu {
  readonly root: HTMLDivElement;
  private selected: Mode = 'facile';
  onPlay: ((mode: Mode) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el<HTMLDivElement>(`
      <div class="screen menu" data-testid="menu">
        <div class="menu-card">
          <h1 class="title">Gueule <span>de</span> bois</h1>
          <p class="tagline">Tu te réveilles sur un banc. Tes lunettes, tes clés, ta voiture : tout a disparu. Rentre chez toi.</p>
          <div class="modes" role="radiogroup" aria-label="Difficulté"></div>
          <button class="btn primary play" data-testid="play">Jouer</button>
          <p class="touch-hint">Joystick à gauche pour marcher, glisse à droite pour tourner la caméra, gros bouton pour agir.</p>
          <details class="controls">
            <summary>Contrôles</summary>
            <ul>
              <li><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> se déplacer</li>
              <li>Souris : caméra (clic pour capturer, <kbd>Échap</kbd> pour libérer)</li>
              <li><kbd>Shift</kbd> courir · <kbd>Espace</kbd> sauter / frein à main</li>
              <li><kbd>E</kbd> ramasser, monter ou descendre, ouvrir</li>
              <li><kbd>Tab</kbd> inventaire · <kbd>Échap</kbd> pause · <kbd>M</kbd> son</li>
            </ul>
          </details>
        </div>
      </div>`);
    parent.appendChild(this.root);
    this.root.querySelector('.play')!.addEventListener('click', () => this.onPlay?.(this.selected));
    this.render();
  }

  render(): void {
    const best = loadBest();
    const wrap = this.root.querySelector('.modes')!;
    wrap.innerHTML = '';
    (Object.keys(MODES) as Mode[]).forEach((m) => {
      const cfg = MODES[m];
      const b = best[m];
      const card = el<HTMLButtonElement>(`
        <button class="mode ${m === this.selected ? 'selected' : ''}" role="radio" aria-checked="${m === this.selected}" data-mode="${m}">
          <b>${cfg.label}</b>
          <span class="dur">${cfg.duration} · ${cfg.blocks}×${cfg.blocks} blocs</span>
          <span class="blurb">${MODE_BLURB[m]}</span>
          <span class="best">${b !== undefined ? `Record : ${formatTime(b)}` : 'Pas encore de record'}</span>
        </button>`);
      card.addEventListener('click', () => {
        this.selected = m;
        this.render();
      });
      wrap.appendChild(card);
    });
  }

  select(mode: Mode): void {
    this.selected = mode;
    this.render();
  }

  show(v: boolean): void {
    this.root.hidden = !v;
    if (v) this.render();
  }
}

/** Écran de fin. */
export class EndScreen {
  readonly root: HTMLDivElement;
  onReplay: (() => void) | null = null;
  onSameCity: (() => void) | null = null;
  onMenu: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el<HTMLDivElement>(`
      <div class="screen end" hidden data-testid="end">
        <div class="menu-card">
          <h2>Enfin chez toi !</h2>
          <p class="end-sub">Tu t'écroules sur ton lit. Plus jamais ça (jusqu'à samedi prochain).</p>
          <dl class="stats"></dl>
          <div class="end-buttons">
            <button class="btn primary" data-action="replay">Rejouer</button>
            <button class="btn" data-action="same">Même ville</button>
            <button class="btn ghost" data-action="menu">Menu</button>
          </div>
        </div>
      </div>`);
    parent.appendChild(this.root);
    this.root.querySelector('[data-action="replay"]')!.addEventListener('click', () => this.onReplay?.());
    this.root.querySelector('[data-action="same"]')!.addEventListener('click', () => this.onSameCity?.());
    this.root.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.onMenu?.());
  }

  show(data: { time: number; mode: Mode; seed: number; record: boolean; best?: number } | null): void {
    this.root.hidden = !data;
    if (!data) return;
    this.root.querySelector('.stats')!.innerHTML = `
      <div><dt>Temps</dt><dd>${formatTime(data.time)}${data.record ? ' <span class="record">Record !</span>' : ''}</dd></div>
      <div><dt>Mode</dt><dd>${MODES[data.mode].label}</dd></div>
      <div><dt>Seed</dt><dd>${data.seed}</dd></div>
      ${data.best !== undefined ? `<div><dt>Meilleur temps</dt><dd>${formatTime(data.best)}</dd></div>` : ''}`;
  }
}

/** Menu pause. */
export class PauseScreen {
  readonly root: HTMLDivElement;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onMenu: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el<HTMLDivElement>(`
      <div class="screen pause" hidden>
        <div class="menu-card small">
          <h2>Pause</h2>
          <p class="end-sub">Un verre d'eau, et ça repart.</p>
          <div class="end-buttons column">
            <button class="btn primary" data-action="resume">Reprendre</button>
            <button class="btn" data-action="restart">Recommencer (même ville)</button>
            <button class="btn ghost" data-action="menu">Menu principal</button>
          </div>
        </div>
      </div>`);
    parent.appendChild(this.root);
    this.root.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.onResume?.());
    this.root.querySelector('[data-action="restart"]')!.addEventListener('click', () => this.onRestart?.());
    this.root.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.onMenu?.());
  }

  show(v: boolean): void {
    this.root.hidden = !v;
  }
}
