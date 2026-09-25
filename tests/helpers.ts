import { expect, type Page } from '@playwright/test';

/** Collecte les erreurs console / page pour vérifier qu'il n'y en a aucune. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

export async function waitForHook(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__game !== 'undefined', null, { timeout: 120_000 });
}

export async function startGame(page: Page, mode: 'facile' | 'normal' | 'hardcore', seed: number): Promise<void> {
  await waitForHook(page);
  await page.evaluate(([m, s]) => window.__game.debug.startGame(m as 'facile', s as number), [mode, seed] as const);
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('playing');
  // En rendu logiciel, le processus GPU peut encore digérer le chargement : on attend que
  // le temps de jeu avance vraiment avant de continuer.
  await expect.poll(() => page.evaluate(() => window.__game.debug.elapsed()), { timeout: 180_000 }).toBeGreaterThan(0.2);
}

/** Attend que le jeu ait rendu quelques images. */
export async function waitFrames(page: Page, n = 10): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => (++i >= count ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/** Attend que l'invite d'interaction attendue soit active, puis appuie sur E. */
export async function interactWhen(page: Page, promptPart: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__game.prompt)).toContain(promptPart);
  await pressE(page);
}

/** Vrai si un des derniers messages contient le texte. */
export async function sawMessage(page: Page, text: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__game.messages.join(' | '))).toContain(text);
}

export async function pressE(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await waitFrames(page, 4);
}

/** Décode une capture dans la page et compte les couleurs distinctes (quantifiées). */
export async function colorVariety(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 72;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 128, 72);
    const d = ctx.getImageData(0, 0, 128, 72).data;
    const colors = new Set<number>();
    for (let i = 0; i < d.length; i += 4) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return colors.size;
  }, png.toString('base64'));
}

/** Netteté moyenne (gradient horizontal) d'une zone de capture : sert à mesurer le flou. */
export async function sharpness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    // Bande haute de l'image : le décor lointain
    const h = Math.floor(img.height * 0.45);
    const d = ctx.getImageData(0, 0, img.width, h).data;
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const lum = d[i] + d[i + 1] + d[i + 2];
        const prev = d[i - 4] + d[i - 3] + d[i - 2];
        sum += Math.abs(lum - prev);
        n++;
      }
    }
    return sum / n;
  }, png.toString('base64'));
}
