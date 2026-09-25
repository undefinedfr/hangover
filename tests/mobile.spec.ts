import { test, expect, devices } from '@playwright/test';
import { startGame, waitFrames, watchErrors } from './helpers';

test.use({ ...devices['Pixel 7'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('M8. mobile : contrôles tactiles, joystick et bouton d\'action', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.locator('.touch-hint')).toBeVisible();
  await startGame(page, 'facile', 42);
  await expect(page.locator('.touch')).toBeVisible();
  await expect(page.locator('.tbtn.action')).toBeVisible();
  await waitFrames(page, 10);

  const before = await page.evaluate(() => window.__game.player.position);
  // Joystick poussé vers le haut
  await page.evaluate(() => {
    const zone = document.querySelector('.touch-zone.left')!;
    const opts = { pointerId: 7, bubbles: true, pointerType: 'touch' } as const;
    zone.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 100, clientY: 600 }));
    zone.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 100, clientY: 520 }));
  });
  await expect
    .poll(async () => {
      const p = await page.evaluate(() => window.__game.player.position);
      return Math.hypot(p.x - before.x, p.z - before.z);
    })
    .toBeGreaterThan(1);
  await page.evaluate(() => {
    const zone = document.querySelector('.touch-zone.left')!;
    zone.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, pointerType: 'touch' }));
  });

  // Bouton d'action = E : on ramasse les lunettes
  await page.evaluate(() => window.__game.debug.teleportTo('lunettes'));
  await waitFrames(page, 5);
  await expect(page.locator('.tbtn.action')).toHaveClass(/ready/);
  await page.screenshot({ path: 'tests/screenshots/mobile.png' });
  await page.locator('.tbtn.action').dispatchEvent('pointerdown');
  await expect.poll(() => page.evaluate(() => window.__game.inventory)).toContain('lunettes');
  expect(errors).toEqual([]);
});
