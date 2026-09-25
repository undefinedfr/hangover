import { test, expect, type Page } from '@playwright/test';
import { startGame, waitFrames, pressE } from './helpers';

async function holdUntilMoved(page: Page, key: string, min: number, from: { x: number; z: number }) {
  await page.keyboard.down(key);
  await expect
    .poll(
      async () => {
        const p = await page.evaluate(() => window.__game.player.position);
        return Math.hypot(p.x - from.x, p.z - from.z);
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(min);
  await page.keyboard.up(key);
}

async function rideAndLeave(page: Page, name: string) {
  expect(await page.evaluate((n) => window.__game.debug.teleportTo(n), name)).toBe(true);
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inVehicle)).toBe(name);
  // Caméra alignée sur le véhicule : « avancer » = marche avant
  const start = await page.evaluate(() => window.__game.player.position);
  await holdUntilMoved(page, 'KeyW', 3, start);
  await waitFrames(page, 20);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inVehicle)).toBe(null);
  // Pas coincé : on peut repartir à pied
  await waitFrames(page, 10);
  const foot = await page.evaluate(() => window.__game.player.position);
  await holdUntilMoved(page, 'KeyS', 0.8, foot);
}

test('M5. voiture verrouillée sans les clés', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await page.evaluate(() => window.__game.debug.teleportTo('voiture'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.message)).toContain("C'est fermé");
  expect(await page.evaluate(() => window.__game.inVehicle)).toBe(null);
});

test('M5. trottinette, tricycle et voiture : monter, rouler, descendre', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 10);
  await rideAndLeave(page, 'trottinette');
  await rideAndLeave(page, 'tricycle');
  await page.evaluate(() => window.__game.debug.teleportTo('clesVoiture'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inventory)).toContain('clesVoiture');
  await rideAndLeave(page, 'voiture');
  expect(await page.evaluate(() => window.__game.inventory)).toContain('voiture');
  await page.screenshot({ path: 'tests/screenshots/vehicule-voiture.png' });
});
