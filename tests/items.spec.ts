import { test, expect } from '@playwright/test';
import { startGame, waitFrames, pressE } from './helpers';

for (const mode of ['facile', 'normal'] as const) {
  test(`4. téléportation sur chaque objet + E : l'inventaire se remplit (${mode})`, async ({ page }) => {
    await page.goto('./');
    await startGame(page, mode, 42);
    await waitFrames(page, 10);
    const expected =
      mode === 'facile'
        ? ['lunettes', 'clesVoiture', 'clesMaison']
        : ['lunettes', 'telephone', 'portefeuille', 'clesVoiture', 'clesMaison'];
    for (const [i, id] of expected.entries()) {
      const ok = await page.evaluate((name) => window.__game.debug.teleportTo(name), id);
      expect(ok).toBe(true);
      await waitFrames(page, 6);
      if (i === 0) await page.screenshot({ path: `tests/screenshots/item-${mode}-${id}.png` });
      await pressE(page);
      await expect.poll(() => page.evaluate(() => window.__game.inventory)).toContain(id);
      const msg = await page.evaluate(() => window.__game.message);
      expect(msg.length).toBeGreaterThan(10);
    }
    const inv = await page.evaluate(() => window.__game.inventory);
    expect(inv.sort()).toEqual([...expected].sort());
  });
}
