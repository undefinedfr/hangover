// Génère l'image de partage (public/og-image.png) et la capture du README (docs/screenshot.png).
// Usage : npm run build && npx vite preview --port 4173 & node scripts/capture.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(base);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu');
  await page.waitForTimeout(2500);
  return page;
}

// Image de partage : le menu sur la ville floutée
const og = await open(1200, 630);
await og.evaluate(() => document.querySelector('.controls')?.remove());
await og.screenshot({ path: 'public/og-image.png' });
await og.close();

// Capture du README : en jeu, flou encore actif
const shot = await open(1280, 720);
await shot.evaluate(() => window.__game.debug.startGame('normal', 42));
await shot.evaluate(() => window.__game.debug.camera(6, 0.28));
await shot.waitForTimeout(3000);
await shot.screenshot({ path: 'docs/screenshot.png' });
await shot.evaluate(() => {
  window.__game.debug.teleportTo('lunettes');
  window.__game.debug.interact();
});
await shot.waitForTimeout(3000);
await shot.evaluate(() => window.__game.debug.teleportTo('depart'));
await shot.evaluate(() => window.__game.debug.camera(6, 0.28));
await shot.waitForTimeout(2500);
await shot.screenshot({ path: 'docs/screenshot-net.png' });
await browser.close();
console.log('captures générées');
