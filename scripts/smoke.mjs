// Browser smoke test: drives the production build in headless Chrome.
//
//   npm run build && npm run smoke            (CHROME=/path/to/chrome to override)
//   BASE_URL=https://blastradius.ikechukwupeter.com npm run smoke   (against a deployed site)
//
// Asserts: every route renders without console errors; a design runs, pauses (particles
// freeze), takes chaos and stops; a challenge produces a score; the AI tab offers a download
// instead of fetching anything; and no request leaves the origin except Google Fonts
// (and the configured Supabase project, if any).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4321;
const BASE = process.env.BASE_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
const CHROME =
  process.env.CHROME ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
// The build talks to Supabase only if one was configured at build time (.env.local or env).
const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const supabaseUrl = process.env.VITE_SUPABASE_URL || envFile.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const ALLOWED_HOSTS = [new URL(BASE).hostname, 'fonts.googleapis.com', 'fonts.gstatic.com', ...(supabaseUrl ? [new URL(supabaseUrl).hostname] : [])];

if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome');

const server = process.env.BASE_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* not up yet */
    }
    await wait(200);
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  const offOrigin = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (r.url().startsWith('http') && !ALLOWED_HOSTS.includes(host)) offOrigin.add(host);
  });
  const click = (text) =>
    page.evaluate((t) => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
      el?.click();
      return !!el;
    }, text);
  const particlePositions = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__edge circle')]
        .slice(0, 6)
        .map((c) => {
          const r = c.getBoundingClientRect();
          return `${Math.round(r.x)},${Math.round(r.y)}`;
        })
        .join(' '),
    );

  // Landing: live demo renders and animates.
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  check((await page.$$('.react-flow__node')).length >= 9, 'landing: live demo renders the event-driven template');

  // Editor
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' });
  check(await click('The Weekend Project'), 'editor: template picker offers templates');
  await wait(600);
  await click('Skip');
  check((await page.$$('.react-flow__node')).length === 3, 'editor: template loads 3 components');
  await page.keyboard.press('Space');
  await wait(2500);
  const a = await particlePositions();
  await wait(300);
  check(a && a !== (await particlePositions()), 'editor: particles move while running');
  await page.keyboard.press('Space');
  await wait(300);
  const p1 = await particlePositions();
  await wait(600);
  check(p1 === (await particlePositions()), 'editor: particles freeze while paused');
  await page.keyboard.press('Space');
  const db = await page.$('.react-flow__node[data-id="db"]');
  const box = await db.boundingBox();
  await page.mouse.click(box.x + 30, box.y + 20, { button: 'right' });
  await wait(200);
  await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find((x) => x.textContent.includes('Kill instance'))?.click());
  await wait(1500);
  const log = await page.evaluate(() => document.body.innerText);
  check(/lost its only instance|primary lost/.test(log), 'editor: chaos lands in the incident log');
  check(/DOWN/i.test(log), 'editor: killed node shows DOWN');
  await page.keyboard.press('Escape');
  await wait(300);
  check(await page.evaluate(() => !!document.querySelector('button[aria-label="Play"]')), 'editor: Esc stops the simulation');
  await click('review');
  await wait(1200);
  check(/single point of failure/.test(await page.evaluate(() => document.body.innerText)), 'editor: review names the single point of failure');
  await click('AI');
  await wait(800);
  const ai = await page.evaluate(() => document.body.innerText);
  check(/Download & start|Start analyst|isn't available here/.test(ai), 'editor: AI tab offers an explicit opt-in (or explains why it cannot run)');

  // Drawing: a looping link becomes drawing-only; labels; library components; notes.
  await page.keyboard.press('Escape');
  const handle = async (node, side) => {
    await page.hover(`.react-flow__node[data-id="${node}"]`);
    const bb = await (await page.$(`.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${side}"]`)).boundingBox();
    return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  };
  const from = await handle('db', 'b');
  const to = await handle('api', 'b');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y + 60, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await wait(900);
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('br:draft')).design);
  const loop = (await draft()).edges.find((e) => e.source === 'db' && e.target === 'api');
  check(loop?.kind === 'annotation', 'drawing: a link that would loop traffic is kept as drawing-only');
  const mid = await page.evaluate((id) => {
    const path = document.querySelector(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`);
    const q = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return { x: q.x * m.a + m.e, y: q.y * m.d + m.f };
  }, loop.id);
  await page.mouse.click(mid.x, mid.y, { count: 2 });
  await wait(300);
  await page.keyboard.type('replication');
  await page.keyboard.press('Enter');
  await wait(900);
  check((await draft()).edges.find((e) => e.id === loop.id)?.label === 'replication', 'drawing: double-click a link to label it');
  check(await click('Event stream'), 'drawing: library components can be added');
  check(await click('Text note'), 'drawing: notes can be added');
  await wait(900);
  const d = await draft();
  check(d.nodes.some((n) => n.kind === 'queue' && n.appearance?.typeLabel === 'Event stream') && d.annotations?.length === 1, 'drawing: custom components keep their behaviour; notes are saved');

  // Challenge
  await page.goto(`${BASE}/challenges/slow-provider`, { waitUntil: 'networkidle0' });
  await page.select('select', 't:event-driven');
  await click('Run challenge');
  await wait(1500);
  await click('Skip to results');
  await wait(2500);
  const res = await page.evaluate(() => document.body.innerText);
  check(/1000\s*\/1000/.test(res) && /Survived/i.test(res), 'challenge: event-driven survives The Slow Provider with 1000');

  // Content routes
  for (const route of ['/challenges', '/leaderboard', '/auth', '/does-not-exist']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' });
    check((await page.evaluate(() => document.body.innerText.length)) > 50, `route ${route} renders`);
  }

  // Phone: the diagram turns top-to-bottom at full size, nothing scrolls sideways, taps break things.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('br:draft'));
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' });
  await click('Classic Three-Tier');
  await wait(1200);
  const layout = await page.evaluate(() => {
    const r = (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`).getBoundingClientRect();
    return { vertical: r('db').top > r('users').bottom, width: r('api').width, noHScroll: document.documentElement.scrollWidth <= innerWidth };
  });
  check(layout.vertical && layout.width >= 150, `phone: diagram flows top-to-bottom at a readable size (${Math.round(layout.width)}px cards)`);
  check(layout.noHScroll, 'phone: no sideways scrolling');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Play')?.click());
  await wait(1500);
  const dbBox = await (await page.$('.react-flow__node[data-id="db"]')).boundingBox();
  await page.touchscreen.tap(dbBox.x + 40, dbBox.y + 20);
  await wait(400);
  check(await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].some((m) => m.textContent.includes('Kill instance'))), 'phone: tapping a component while running opens the chaos menu');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  check(offOrigin.size === 0, `no requests leave the origin${offOrigin.size ? `: ${[...offOrigin].join(', ')}` : ''}`);
  await browser.close();
} finally {
  server?.kill();
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nSmoke test passed');
process.exit(failures.length ? 1 : 0);
