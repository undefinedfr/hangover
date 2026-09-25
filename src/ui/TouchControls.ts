import type { Input } from '../core/Input';

export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  );
}

function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointeur synthétique ou déjà relâché */
  }
}

/** Joystick virtuel à gauche, zone caméra à droite, boutons d'action. */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly actionBtn: HTMLButtonElement;
  private moveId: number | null = null;
  private lookId: number | null = null;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };
  private readonly radius = 56;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-zone left"></div>
      <div class="touch-zone right"></div>
      <div class="stick"><div class="knob"></div></div>
      <div class="touch-buttons">
        <button class="tbtn small" data-code="Tab" aria-label="Inventaire">Sac</button>
        <button class="tbtn small run" data-toggle="run" aria-label="Courir">Courir</button>
        <button class="tbtn" data-code="Space" aria-label="Sauter">Saut</button>
        <button class="tbtn action" data-code="KeyE" aria-label="Action">E</button>
      </div>`;
    parent.appendChild(this.root);
    this.base = this.root.querySelector('.stick')!;
    this.knob = this.root.querySelector('.knob')!;
    this.actionBtn = this.root.querySelector('.action')!;
    const left = this.root.querySelector<HTMLDivElement>('.touch-zone.left')!;
    const right = this.root.querySelector<HTMLDivElement>('.touch-zone.right')!;

    left.addEventListener('pointerdown', (e) => {
      if (this.moveId !== null) return;
      this.moveId = e.pointerId;
      capture(left, e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('active');
      this.setKnob(0, 0);
    });
    left.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.moveId) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) {
        dx = (dx / len) * this.radius;
        dy = (dy / len) * this.radius;
      }
      this.setKnob(dx, dy);
      this.input.virtualMove.x = dx / this.radius;
      this.input.virtualMove.y = -dy / this.radius;
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.moveId) return;
      this.moveId = null;
      this.base.classList.remove('active');
      this.input.virtualMove.x = 0;
      this.input.virtualMove.y = 0;
    };
    left.addEventListener('pointerup', endMove);
    left.addEventListener('pointercancel', endMove);

    right.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      capture(right, e.pointerId);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    right.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook((e.clientX - this.lastLook.x) * 1.6, (e.clientY - this.lastLook.y) * 1.6);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    right.addEventListener('pointerup', endLook);
    right.addEventListener('pointercancel', endLook);

    this.root.querySelectorAll<HTMLButtonElement>('.tbtn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (b.dataset.toggle === 'run') {
          this.input.virtualRun = !this.input.virtualRun;
          b.classList.toggle('on', this.input.virtualRun);
          return;
        }
        const code = b.dataset.code!;
        this.input.press(code);
        // Tab : le jeu écoute l'événement clavier brut
        if (code === 'Tab') this.input.onKey?.('Tab', new KeyboardEvent('keydown', { code: 'Tab' }));
      });
    });
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  show(v: boolean): void {
    this.root.hidden = !v;
    if (!v) {
      this.input.virtualMove.x = this.input.virtualMove.y = 0;
      this.moveId = this.lookId = null;
    }
  }

  /** Le bouton d'action s'illumine quand une interaction est possible. */
  setActionHint(text: string): void {
    this.actionBtn.classList.toggle('ready', text.length > 0);
  }
}
