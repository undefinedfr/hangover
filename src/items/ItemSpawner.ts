import * as THREE from 'three/webgpu';
import { RNG } from '../core/rng';
import type { ItemId, ModeConfig } from '../core/GameState';
import type { City, Spot, SpotKind } from '../world/CityGenerator';
import { Item } from './Item';

const KINDS: Record<ModeConfig['hiding'], SpotKind[]> = {
  open: ['open'],
  behindProps: ['behind'],
  nooks: ['nook'],
};

/** Répartit les objets du mode sur les cachettes de la ville (seedé). */
export function spawnItems(seed: number, city: City, cfg: ModeConfig): Item[] {
  const rng = new RNG(seed).fork(0x17e5);
  const start = new THREE.Vector3(city.start.x, 0, city.start.z);
  const door = new THREE.Vector3(city.house.door.x, 0, city.house.door.z);
  const car = new THREE.Vector3(city.carSpawn.x, 0, city.carSpawn.z);
  const kinds = KINDS[cfg.hiding];
  const pool = rng.shuffle(city.spots.filter((s) => kinds.includes(s.kind)));
  const fallback = rng.shuffle(city.spots.slice());

  const chosen: Spot[] = [];
  const flat = (s: Spot) => new THREE.Vector3(s.x, 0, s.z);
  const cityScale = city.extent;

  const pickFor = (id: ItemId, relax: number): Spot | undefined => {
    const minSpacing = (cityScale / 4) * relax;
    const ok = (s: Spot) => {
      const p = flat(s);
      if (p.distanceTo(start) < 12) return false;
      if (p.distanceTo(door) < 20 * relax) return false;
      if (p.distanceTo(car) < 8) return false;
      if (chosen.some((c) => flat(c).distanceTo(p) < minSpacing)) return false;
      // Sans lunettes tout est flou : on ne les cache pas au bout du monde
      if (id === 'lunettes' && p.distanceTo(start) > cityScale * 0.8) return false;
      return true;
    };
    return pool.find(ok) ?? (relax < 0.3 ? fallback.find(ok) : undefined);
  };

  return cfg.items.map((id) => {
    let spot: Spot | undefined;
    for (let relax = 1; !spot && relax > 0.05; relax *= 0.6) spot = pickFor(id, relax);
    spot ??= fallback.find((s) => !chosen.includes(s))!;
    chosen.push(spot);
    return new Item(id, new THREE.Vector3(spot.x, spot.y, spot.z), spot.label, cfg.haloDistance);
  });
}

/** Une réplique différente par objet, qui mentionne la cachette. */
export function pickupMessage(id: ItemId, label: string): string {
  switch (id) {
    case 'lunettes':
      return `Tes lunettes étaient ${label}. Classique. Le monde redevient net.`;
    case 'telephone':
      return `Ton téléphone était ${label}. 3 % de batterie, 27 messages. On lira plus tard.`;
    case 'portefeuille':
      return `Ton portefeuille était ${label}. Il reste 4,20 € et un ticket de vestiaire.`;
    case 'clesVoiture':
      return `Les clés de la voiture étaient ${label}. Reste à retrouver la voiture…`;
    case 'clesMaison':
      return `Les clés de la maison étaient ${label}. Ton lit t'appelle.`;
  }
}
