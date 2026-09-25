/** Réglage graphique : « haute » (AO, pleine résolution) ou « basse » (machines modestes). */
export type Quality = 'haute' | 'basse';

const KEY = 'gueule-de-bois.quality';

export function getQuality(): Quality {
  const url = new URLSearchParams(location.search).get('quality');
  if (url === 'low' || url === 'basse') return 'basse';
  if (url === 'high' || url === 'haute') return 'haute';
  try {
    return localStorage.getItem(KEY) === 'basse' ? 'basse' : 'haute';
  } catch {
    return 'haute';
  }
}

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* stockage indisponible */
  }
}

/** Vrai en qualité basse : les matériaux se passent des bruits procéduraux coûteux. */
export function isLite(): boolean {
  return getQuality() === 'basse';
}
