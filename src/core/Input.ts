/** Clavier (event.code = position physique : ZQSD/WASD automatiques) + souris. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  /** Axes virtuels (joystick tactile), additionnés au clavier. */
  virtualMove = { x: 0, y: 0 };
  virtualRun = false;
  /** Écoute brute des appuis (menus, pause…). */
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        this.onKey?.(e.code, e);
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.element) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      const p = this.element.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => undefined);
    } catch {
      /* navigateur sans pointer lock */
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Simule un appui (bouton tactile). */
  press(code: string): void {
    this.pressed.add(code);
  }

  /** Vrai une seule fois par appui (consommé par le premier lecteur). */
  consume(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  clearPressed(): void {
    this.pressed.clear();
  }

  get run(): boolean {
    return this.virtualRun || this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** x : gauche/droite, y : avant/arrière, dans [-1, 1]. */
  moveAxes(): { x: number; y: number } {
    let x = this.virtualMove.x;
    let y = this.virtualMove.y;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  /** Déplacement caméra accumulé (souris ou zone tactile). */
  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  takeLook(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }
}
