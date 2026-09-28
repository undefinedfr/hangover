// Génère l'image de partage (public/og-image.png) et la capture du README (docs/screenshot.png).
// Usage : npm run build && npx vite preview --port 4173 & node scripts/capture.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}?quality=high`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 900000 });
  await page.waitForTimeout(8000);
  return page;
}

// Image de partage : le menu sur la ville floutée
const og = await open(1200, 630);
await og.evaluate(() => document.querySelector('.controls')?.remove());
await og.screenshot({ path: 'public/og-image.png', timeout: 240000 });
await og.close();

// Capture du README : en jeu, flou encore actif
const shot = await open(1280, 720);
await shot.evaluate(() => window.__game.debug.startGame('normal', 42));
await shot.waitForFunction(() => window.__game.debug.elapsed() > 0.5, null, { timeout: 900000 });
await shot.evaluate(() => window.__game.debug.camera(3.9, 0.14));
await shot.waitForTimeout(4000);
await shot.screenshot({ path: 'docs/screenshot.png', timeout: 240000 });
await shot.evaluate(() => window.__game.debug.teleportTo('lunettes'));
await shot.waitForFunction(() => window.__game.prompt.includes('Ramasser'), null, { timeout: 900000 });
await shot.evaluate(() => window.__game.debug.interact());
await shot.waitForFunction(() => window.__game.blur === 0, null, { timeout: 900000 });
await shot.evaluate(() => {
  const g = window.__game;
  const L = g.debug.layout();
  g.debug.teleportTo('maisonRue');
  const p = g.player.position;
  g.debug.camera(9, 0.18, Math.atan2(L.house.x - p.x, L.house.z - p.z));
});
await shot.waitForTimeout(5000);
await shot.screenshot({ path: 'docs/screenshot-net.png', timeout: 240000 });
await browser.close();
console.log('captures générées');
