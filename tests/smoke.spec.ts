import { test, expect } from '@playwright/test';
import { watchErrors, waitForHook, startGame, waitFrames, colorVariety } from './helpers';

test('1. la page charge sans erreur console', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await waitForHook(page);
  await expect(page.locator('#game')).toBeVisible();
  await waitFrames(page, 5);
  expect(errors).toEqual([]);
});

test('2. startGame facile 42 : on joue et le canvas n\'est pas vide', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 30);
  const shot = await page.screenshot({ path: 'tests/screenshots/playing-facile-42.png' });
  expect(shot.byteLength).toBeGreaterThan(20_000);
  // L'image contient des pixels variés (pas un aplat)
  const variety = await colorVariety(page, shot);
  expect(variety).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('3. appui prolongé sur avancer : le joueur se déplace', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 10);
  const before = await page.evaluate(() => window.__game.player.position);
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => {
      const p = await page.evaluate(() => window.__game.player.position);
      return Math.hypot(p.x - before.x, p.z - before.z);
    })
    .toBeGreaterThan(1);
  await page.keyboard.up('KeyW');
});

test('M1. saut : le joueur décolle puis retombe', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 20);
  const y0 = await page.evaluate(() => window.__game.player.position.y);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__game.player.position.y), { intervals: [20] }).toBeGreaterThan(y0 + 0.3);
  await expect.poll(() => page.evaluate(() => window.__game.player.position.y)).toBeLessThan(y0 + 0.05);
});
