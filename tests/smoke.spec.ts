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
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__game.player.position);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved).toBeGreaterThan(0.5);
});

test('M1. saut : le joueur décolle puis retombe', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 20);
  const y0 = await page.evaluate(() => window.__game.player.position.y);
  await page.keyboard.press('Space');
  let peak = y0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(30);
    peak = Math.max(peak, await page.evaluate(() => window.__game.player.position.y));
  }
  expect(peak - y0).toBeGreaterThan(0.3);
  await page.waitForTimeout(1500);
  const y1 = await page.evaluate(() => window.__game.player.position.y);
  expect(Math.abs(y1 - y0)).toBeLessThan(0.2);
});
