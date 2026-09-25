import { test, expect } from '@playwright/test';

test('M7. navigateur sans WebGPU ni WebGL2 : message clair', async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { gpu?: unknown }).gpu;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'webgpu') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto('./');
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal h2')).toContainText('navigateur');
  await expect(page.locator('#loading')).toBeHidden();
});

test('M7. titre, description, favicon et image de partage', async ({ page, request }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Gueule de bois');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /banc/);
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toBeTruthy();
  expect((await request.get(new URL(og!, page.url()).toString())).status()).toBe(200);
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect((await request.get(new URL(icon!, page.url()).toString())).status()).toBe(200);
});
