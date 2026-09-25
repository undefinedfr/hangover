import { test, expect } from '@playwright/test';
import { startGame, waitFrames, pressE, sharpness } from './helpers';

test('M4. flou sans lunettes, net après les avoir ramassées', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'normal', 42);
  await page.evaluate(() => window.__game.debug.teleportTo('lunettes'));
  await page.evaluate(() => window.__game.debug.camera(5.5, 0.12));
  await waitFrames(page, 20);
  expect(await page.evaluate(() => window.__game.blur)).toBeGreaterThan(0.5);
  const before = await page.screenshot({ path: 'tests/screenshots/blur-avant-lunettes.png' });

  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inventory)).toContain('lunettes');
  await expect.poll(() => page.evaluate(() => window.__game.blur)).toBe(0);
  await waitFrames(page, 10);
  const after = await page.screenshot({ path: 'tests/screenshots/blur-apres-lunettes.png' });

  const sBefore = await sharpness(page, before);
  const sAfter = await sharpness(page, after);
  console.log('netteté avant/après', sBefore.toFixed(2), sAfter.toFixed(2));
  expect(sAfter).toBeGreaterThan(sBefore * 1.3);
});
