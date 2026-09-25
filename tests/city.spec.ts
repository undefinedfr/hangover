import { test, expect } from '@playwright/test';
import { startGame, waitFrames } from './helpers';

test('M2. on ne traverse pas les immeubles', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 10);
  const rects = await page.evaluate(() => window.__game.debug.footprints());
  expect(rects.length).toBeGreaterThan(10);
  // On teste quelques façades : on se place à 1,5 m devant et on fonce dedans
  const inAny = (x: number, z: number) => rects.some((o) => x > o.minX - 0.5 && x < o.maxX + 0.5 && z > o.minZ - 0.5 && z < o.maxZ + 0.5);
  const candidates = rects.filter((r) => !inAny(r.maxX + 1.5, (r.minZ + r.maxZ) / 2));
  expect(candidates.length).toBeGreaterThan(2);
  for (const r of candidates.slice(0, 3)) {
    const cz = (r.minZ + r.maxZ) / 2;
    await page.evaluate(
      ([x, z]) => {
        window.__game.debug.teleportXYZ(x, 0.2, z);
        window.__game.debug.camera(5, 0.3, -Math.PI / 2); // regarde vers -x
      },
      [r.maxX + 1.5, cz],
    );
    await waitFrames(page, 5);
    await page.keyboard.down('KeyW');
    // Laisse au personnage le temps (de jeu) de parcourir plusieurs mètres
    await page.evaluate(async () => {
      const t0 = performance.now();
      let frames = 0;
      await new Promise<void>((r) => {
        const tick = () => (++frames > 40 && performance.now() - t0 > 1500 ? r() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    });
    await page.keyboard.up('KeyW');
    const p = await page.evaluate(() => window.__game.player.position);
    const inside = p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
    expect(inside).toBe(false);
    // Le joueur a bien avancé jusqu'au mur (sans le traverser)
    expect(p.x).toBeLessThan(r.maxX + 1.2);
  }
});

for (const mode of ['normal', 'hardcore'] as const) {
  test(`M2. la ville ${mode} se génère`, async ({ page }) => {
    await page.goto('./');
    await startGame(page, mode, 7);
    await waitFrames(page, 10);
    await page.screenshot({ path: `tests/screenshots/city-${mode}-7.png` });
    const n = await page.evaluate(() => window.__game.debug.footprints().length);
    expect(n).toBeGreaterThan(mode === 'normal' ? 60 : 150);
  });
}
