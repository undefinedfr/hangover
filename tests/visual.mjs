// Script de captures ad hoc (hors suite de tests) : node tests/visual.mjs mode seed
import { chromium } from '@playwright/test';
const [mode = 'facile', seed = '42', out = 'tests/screenshots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(([m, s]) => window.__game.debug.startGame(m, Number(s)), [mode, seed]);
const wait = (ms) => page.waitForTimeout(ms);
const shots = (process.env.SHOTS ?? 'depart').split(',');
for (const name of shots) {
  const [place, dist, pitch, yaw] = name.split(':');
  await page.evaluate((p) => window.__game.debug.teleportTo(p), place);
  if (dist) await page.evaluate(([d, p, y]) => window.__game.debug.camera(Number(d), Number(p), y === undefined ? undefined : Number(y)), [dist, pitch, yaw]);
  await wait(1500);
  const f = `${out}/${mode}-${seed}-${name.replace(/[:.]/g, '_')}.png`;
  await page.screenshot({ path: f });
  console.log('shot', f, await page.evaluate(() => JSON.stringify({ fps: window.__game.fps, pos: window.__game.player.position, backend: window.__game.backend })));
}
await browser.close();
