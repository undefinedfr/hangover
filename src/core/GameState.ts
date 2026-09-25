export type Mode = 'facile' | 'normal' | 'hardcore';
export type State = 'menu' | 'playing' | 'paused' | 'won';
export type ItemId = 'lunettes' | 'telephone' | 'portefeuille' | 'clesVoiture' | 'clesMaison';
/** Tout ce qui peut apparaître dans l'inventaire (la voiture compte quand on l'a récupérée). */
export type InventoryId = ItemId | 'voiture';

export type HidingStyle = 'open' | 'behindProps' | 'nooks';
export type MinimapStyle = 'items' | 'carHouse' | 'none';

export interface ModeConfig {
  label: string;
  duration: string;
  blocks: number;
  items: ItemId[];
  /** Distance max d'affichage du halo (0 = aucun halo). */
  haloDistance: number;
  /** Intensité max du flou (0..1). */
  blurStrength: number;
  /** Rayon net autour du joueur (m). */
  sharpRadius: number;
  /** Intensité du titubement. */
  sway: number;
  minimap: MinimapStyle;
  hiding: HidingStyle;
  walletRequired: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  facile: {
    label: 'Facile',
    duration: '~5 min',
    blocks: 4,
    items: ['lunettes', 'clesVoiture', 'clesMaison'],
    haloDistance: 1000,
    blurStrength: 0.5,
    sharpRadius: 4,
    sway: 0.35,
    minimap: 'items',
    hiding: 'open',
    walletRequired: false,
  },
  normal: {
    label: 'Normal',
    duration: '~15 min',
    blocks: 7,
    items: ['lunettes', 'telephone', 'portefeuille', 'clesVoiture', 'clesMaison'],
    haloDistance: 15,
    blurStrength: 0.8,
    sharpRadius: 3,
    sway: 0.7,
    minimap: 'carHouse',
    hiding: 'behindProps',
    walletRequired: true,
  },
  hardcore: {
    label: 'Hardcore',
    duration: '30 min et +',
    blocks: 11,
    items: ['lunettes', 'telephone', 'portefeuille', 'clesVoiture', 'clesMaison'],
    haloDistance: 0,
    blurStrength: 1,
    sharpRadius: 1.5,
    sway: 1.15,
    minimap: 'none',
    hiding: 'nooks',
    walletRequired: true,
  },
};

export const ITEM_LABELS: Record<InventoryId, string> = {
  lunettes: 'Lunettes',
  telephone: 'Téléphone',
  portefeuille: 'Portefeuille',
  clesVoiture: 'Clés de voiture',
  clesMaison: 'Clés de maison',
  voiture: 'Voiture',
};

export const ALL_INVENTORY: InventoryId[] = [
  'lunettes',
  'telephone',
  'portefeuille',
  'clesVoiture',
  'clesMaison',
  'voiture',
];

export function isMode(v: unknown): v is Mode {
  return v === 'facile' || v === 'normal' || v === 'hardcore';
}
