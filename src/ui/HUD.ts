import { ITEM_LABELS, type InventoryId } from '../core/GameState';
import { ICONS, MUTE_ICON, SOUND_ICON } from './icons';

const HINTS: Record<InventoryId, string> = {
  lunettes: 'Pour voir plus loin que le bout de ton nez.',
  telephone: 'Affiche une mini-carte (quand il veut bien).',
  portefeuille: 'Sans papiers, pas de volant.',
  clesVoiture: 'Pour ouvrir et conduire la voiture.',
  clesMaison: 'Pour ouvrir la porte de chez toi.',
  voiture: 'Garée quelque part. Mais où ?',
};

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Interface en jeu, en HTML/CSS par-dessus le canvas. */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  readonly minimap: HTMLCanvasElement;
  private readonly muteBtn: HTMLButtonElement;
  private toastTimer = 0;
  private promptText = '';
  onMute: (() => boolean) | null = null;
  onPause: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-items" data-role="bar"></div>
        <div class="hud-timer" data-role="timer">00:00</div>
        <div class="hud-buttons">
          <button class="icon-btn" data-role="mute" title="Couper le son (M)" aria-label="Couper le son"></button>
          <button class="icon-btn pause-btn" data-role="pause" title="Pause (Échap)" aria-label="Pause">❚❚</button>
        </div>
      </div>
      <div class="hud-toast" data-role="toast"></div>
      <div class="hud-prompt" data-role="prompt"></div>
      <canvas class="hud-minimap" data-role="minimap" width="220" height="220" hidden></canvas>
      <div class="hud-panel" data-role="panel" hidden></div>
    `;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(role: string) => this.root.querySelector(`[data-role="${role}"]`) as T;
    this.timer = q('timer');
    this.bar = q('bar');
    this.prompt = q('prompt');
    this.toast = q('toast');
    this.panel = q('panel');
    this.minimap = q('minimap');
    this.muteBtn = q('mute');
    this.muteBtn.innerHTML = SOUND_ICON;
    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setMuted(this.onMute?.() ?? false);
    });
    q<HTMLButtonElement>('pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPause?.();
    });
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = muted ? MUTE_ICON : SOUND_ICON;
    this.muteBtn.classList.toggle('off', muted);
  }

  show(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setup(slots: InventoryId[]): void {
    this.bar.innerHTML = slots
      .map((id) => `<div class="hud-item" data-id="${id}" title="${ITEM_LABELS[id]}">${ICONS[id]}</div>`)
      .join('');
    this.panel.innerHTML = `<h3>Inventaire</h3><ul>${slots
      .map(
        (id) =>
          `<li data-id="${id}"><span class="pi">${ICONS[id]}</span><span><b>${ITEM_LABELS[id]}</b><small>${HINTS[id]}</small></span><em></em></li>`,
      )
      .join('')}</ul><p class="panel-foot">Tab pour fermer</p>`;
    this.toast.classList.remove('visible');
    this.setPrompt('');
    this.showPanel(false);
  }

  updateInventory(owned: InventoryId[]): void {
    this.bar.querySelectorAll<HTMLElement>('.hud-item').forEach((el) => {
      const has = owned.includes(el.dataset.id as InventoryId);
      if (has && !el.classList.contains('found')) {
        el.classList.add('found', 'pop');
        setTimeout(() => el.classList.remove('pop'), 600);
      }
      if (!has) el.classList.remove('found');
    });
    this.panel.querySelectorAll<HTMLElement>('li').forEach((el) => {
      const has = owned.includes(el.dataset.id as InventoryId);
      el.classList.toggle('found', has);
      el.querySelector('em')!.textContent = has ? 'trouvé' : '???';
    });
  }

  setTime(seconds: number): void {
    this.timer.textContent = formatTime(seconds);
  }

  setPrompt(text: string): void {
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.innerHTML = text ? text.replace(/^E /, '<kbd>E</kbd> ') : '';
    this.prompt.classList.toggle('visible', text.length > 0);
  }

  message(text: string, seconds = 4.5): void {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    this.toastTimer = seconds;
  }

  togglePanel(): void {
    this.showPanel(this.panel.hidden !== false);
  }

  showPanel(v: boolean): void {
    this.panel.hidden = !v;
  }

  showMinimap(v: boolean): void {
    this.minimap.hidden = !v;
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('visible');
    }
  }
}
