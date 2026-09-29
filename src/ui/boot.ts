/** Accès typé à l'écran de chargement défini en ligne dans index.html (window.__boot). */
interface BootScreen {
  /** Affiche l'écran (repart de zéro s'il était caché). */
  show(label?: string): void;
  /** Progression mesurée entre 0 et 1 (ne recule jamais). */
  set(p: number, label?: string): void;
  /** Étape sans mesure : progression lente vers `to`, constante de temps `tau` secondes. */
  creep(to: number, label?: string, tau?: number): void;
  done(): void;
  hide(): void;
}

const noop: BootScreen = { show() {}, set() {}, creep() {}, done() {}, hide() {} };

export const boot: BootScreen = (window as unknown as { __boot?: BootScreen }).__boot ?? noop;

/** Laisse le navigateur peindre l'écran de chargement avant un calcul synchrone. */
export function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}
