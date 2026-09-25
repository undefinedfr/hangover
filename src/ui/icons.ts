import type { InventoryId } from '../core/GameState';

const wrap = (body: string) =>
  `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<InventoryId, string> = {
  lunettes: wrap(
    '<circle cx="14" cy="26" r="8" stroke="currentColor" stroke-width="3.5"/><circle cx="34" cy="26" r="8" stroke="currentColor" stroke-width="3.5"/><path d="M22 25 q2 -3 4 0" stroke="currentColor" stroke-width="3"/><path d="M6 24 L3 18 M42 24 L45 18" stroke="currentColor" stroke-width="3"/>',
  ),
  telephone: wrap(
    '<rect x="14" y="5" width="20" height="38" rx="4" stroke="currentColor" stroke-width="3.5"/><path d="M21 37 h6" stroke="currentColor" stroke-width="3"/>',
  ),
  portefeuille: wrap(
    '<rect x="6" y="13" width="36" height="24" rx="4" stroke="currentColor" stroke-width="3.5"/><path d="M28 21 h14 v8 h-14 z" stroke="currentColor" stroke-width="3"/><circle cx="33" cy="25" r="1.5" fill="currentColor"/>',
  ),
  clesVoiture: wrap(
    '<rect x="8" y="8" width="16" height="22" rx="5" stroke="currentColor" stroke-width="3.5"/><circle cx="16" cy="17" r="3" fill="currentColor"/><path d="M24 26 L40 40 M34 35 l3 -3 M38 39 l3 -3" stroke="currentColor" stroke-width="3.5"/>',
  ),
  clesMaison: wrap(
    '<circle cx="15" cy="17" r="8" stroke="currentColor" stroke-width="3.5"/><path d="M21 23 L40 42 M31 33 l4 -4 M36 38 l4 -4" stroke="currentColor" stroke-width="3.5"/>',
  ),
  voiture: wrap(
    '<path d="M6 30 v-6 l5 -9 h22 l7 9 h2 v6 z" stroke="currentColor" stroke-width="3.5"/><circle cx="14" cy="32" r="4" fill="currentColor"/><circle cx="34" cy="32" r="4" fill="currentColor"/>',
  ),
};

export const MUTE_ICON = wrap(
  '<path d="M8 19 h8 l10 -8 v26 l-10 -8 h-8 z" stroke="currentColor" stroke-width="3.5"/><path d="M33 18 l10 12 M43 18 l-10 12" stroke="currentColor" stroke-width="3.5"/>',
);
export const SOUND_ICON = wrap(
  '<path d="M8 19 h8 l10 -8 v26 l-10 -8 h-8 z" stroke="currentColor" stroke-width="3.5"/><path d="M32 17 q6 7 0 14 M37 12 q10 12 0 24" stroke="currentColor" stroke-width="3.5"/>',
);
