import { test, expect } from '@playwright/test';
import { startGame, waitFrames, pressE, watchErrors } from './helpers';

test('1b. le menu s\'affiche avec les trois modes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.locator('.title')).toContainText('Gueule');
  await expect(page.locator('.mode')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__game?.state)).toBe('menu');
  await page.screenshot({ path: 'tests/screenshots/menu.png' });
  expect(errors).toEqual([]);
});

test('5. scénario complet en facile via les hooks : victoire', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.goto('./');
  await startGame(page, 'facile', 42);
  await waitFrames(page, 5);

  // La porte refuse tant qu'on n'a rien
  await page.evaluate(() => window.__game.debug.teleportTo('maison'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.message)).toContain('Fermé à clé');

  for (const id of ['lunettes', 'clesVoiture', 'clesMaison']) {
    await page.evaluate((n) => window.__game.debug.teleportTo(n), id);
    await waitFrames(page, 4);
    await pressE(page);
    await expect.poll(() => page.evaluate(() => window.__game.inventory)).toContain(id);
  }

  // À pied, la porte réclame la voiture
  await page.evaluate(() => window.__game.debug.teleportTo('maison'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.message)).toContain('voiture');
  expect(await page.evaluate(() => window.__game.state)).toBe('playing');

  // On récupère la voiture et on « conduit » jusqu'à la maison
  await page.evaluate(() => window.__game.debug.teleportTo('voiture'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inVehicle)).toBe('voiture');
  await page.evaluate(() => window.__game.debug.teleportTo('maison'));
  await expect.poll(() => page.evaluate(() => window.__game.message)).toContain('devant chez toi');
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.inVehicle)).toBe(null);
  await page.evaluate(() => window.__game.debug.teleportTo('maison'));
  await waitFrames(page, 5);
  await pressE(page);
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('won');
  await expect(page.getByTestId('end')).toBeVisible();
  await expect(page.getByTestId('end')).toContainText('Facile');
  await expect(page.getByTestId('end')).toContainText('42');
  await page.screenshot({ path: 'tests/screenshots/victoire.png' });

  // Même ville : même seed, on rejoue
  await page.getByRole('button', { name: 'Même ville' }).click();
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('playing');
  expect(await page.evaluate(() => window.__game.seed)).toBe(42);
  expect(errors).toEqual([]);
});

test('M6. pause avec Échap, reprise', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'normal', 3);
  await waitFrames(page, 5);
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen.pause')).toBeVisible();
  const t0 = await page.evaluate(() => window.__game.debug.elapsed());
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__game.debug.elapsed())).toBe(t0);
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('.screen.pause')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__game.debug.elapsed())).toBeGreaterThan(t0);
});

test('M6. le téléphone affiche la mini-carte en normal', async ({ page }) => {
  await page.goto('./');
  await startGame(page, 'normal', 42);
  await expect(page.locator('.hud-minimap')).toBeHidden();
  await page.evaluate(() => window.__game.debug.teleportTo('telephone'));
  await waitFrames(page, 4);
  await pressE(page);
  await expect(page.locator('.hud-minimap')).toBeVisible();
  await waitFrames(page, 10);
  await page.screenshot({ path: 'tests/screenshots/minimap-normal.png' });
});
