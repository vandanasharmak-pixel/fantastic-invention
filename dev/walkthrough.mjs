/**
 * Drives the real app in a real browser against the stubbed API.
 *
 * Proves three things the unit tests can't: that it renders, that the
 * Hold/Replay wiring behaves end-to-end in React, and that a failing API
 * produces an in-fiction beat rather than a broken screen.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIR = new URL('.', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const p = join(DIR, path === '/' ? 'index.html' : path);
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function run(query, label, fn) {
  console.log(`\n${label}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + query);
  await page.waitForSelector('.rr-app');
  try { await fn(page, errors); } finally { await page.close(); }
  const real = errors.filter((e) => !/favicon|fonts\.googleapis|ERR_/.test(e));
  check(`${label}: no runtime errors`, real.length === 0, real.slice(0, 2).join(' | '));
}

const trustState = (page) => page.evaluate(() => {
  const zone = document.querySelector('.rr-zone-now strong')?.textContent?.trim();
  const moves = [...document.querySelectorAll('.rr-movelog li')].map((li) => li.textContent.trim());
  const struck = document.querySelectorAll('.rr-turn.rr-struck').length;
  return { zone, moves, struck, hasNumber: /\b\d{1,3}\b/.test(zone ?? '') };
});

async function toEpisodeTwo(page) {
  await page.getByRole('button', { name: /Open the account file/ }).click();
  await page.getByRole('button', { name: /Something's landed/ }).click();
  await page.fill('#rr-fact', 'He wrote that "on track without evidence doesn\'t settle me anymore."');
  await page.fill('#rr-story', 'That he no longer trusts us.');
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.getByRole('button', { name: /He's agreed to meet/ }).click();
  await page.waitForSelector('#rr-reply');
}

async function say(page, text) {
  await page.fill('#rr-reply', text);
  await page.locator('.rr-compose button').click();
  await page.waitForFunction(() => !document.querySelector('.rr-waiting'), null, { timeout: 8000 });
}

/* ---- 1. the happy path, plus Hold and Replay ---- */
await run('/', 'Full flow · Episode Two · hold → replay', async (page) => {
  await toEpisodeTwo(page);
  check('renders the dial without a numeric score', !(await trustState(page)).hasNumber);

  await say(page, "We're tracking well against the plan — I'm confident we'll hit the Atlas date.");
  const afterFlub = await trustState(page);
  check('reassurance cools him', afterFlub.zone === 'Guarded', `zone=${afterFlub.zone}`);

  await page.getByRole('button', { name: /Call Hold/ }).click();
  await page.waitForSelector('.rr-void-stamp', { timeout: 8000 });
  check('Hold stamps VOID — RETAKE across the record', true);

  const heldZone = (await trustState(page)).zone;
  check('Hold does not itself move trust', heldZone === afterFlub.zone, `zone=${heldZone}`);

  await say(page, "You're right that we've gone quiet on you, and that's on us.");
  const afterReplay = await trustState(page);
  check('the flawed exchange is struck, not deleted', afterReplay.struck === 2,
    `${afterReplay.struck} struck turns`);
  check('replay lands on the pre-Hold baseline (Neutral, not Guarded)',
    afterReplay.zone === 'Neutral', `zone=${afterReplay.zone}`);
  check('movement log shows only the surviving move',
    afterReplay.moves.filter((m) => /reassured/.test(m)).length === 0,
    afterReplay.moves[0]?.slice(0, 60));

  await page.screenshot({ path: 'dev/shot-episode-two.png', fullPage: true });
});

/* ---- 2. a failing API must never surface as an error ---- */
await run('/?fail=1', 'API down · in-fiction fallback', async (page) => {
  await toEpisodeTwo(page);
  await say(page, "We're confident we'll hit the date.");
  const body = await page.textContent('.rr-transcript');
  check('no raw error text on screen', !/HTTP|undefined|NaN|\[object|Error:/.test(body));
  check('falls back in character', /glances at his phone|choosing his words/.test(body),
    body.slice(-90).replace(/\s+/g, ' '));
  check('degraded beat is marked in-fiction',
    /the line is poor/.test(body));
});

/* ---- 3. resume ---- */
await run('/', 'Persistence · resume where you left off', async (page) => {
  await toEpisodeTwo(page);
  await say(page, "You're right that we've gone quiet, and that's on us.");
  const before = (await trustState(page)).zone;
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(150);

  await page.reload();
  await page.waitForSelector('.rr-resume', { timeout: 5000 });
  check('intro offers resume rather than dropping you in Episode One', true);
  await page.getByRole('button', { name: /Resume — Episode/ }).click();
  await page.waitForSelector('.rr-zone-now');
  const after = (await trustState(page)).zone;
  check('trust survives the reload exactly', after === before, `${before} → ${after}`);
});

/* ---- 4. mobile ---- */
await run('/', 'Mobile · single-column fallback', async (page) => {
  const overflowNow = () => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const oneColumn = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return getComputedStyle(el).gridTemplateColumns.split(' ').length;
  }, sel);

  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole('button', { name: /Open the account file/ }).click();
  check('dossier: no horizontal overflow at 390px', (await overflowNow()) <= 0);
  check('dossier fact table stacks', (await oneColumn('.rr-facts > div')) === 1);

  await page.getByRole('button', { name: /Something's landed/ }).click();
  check('Fact/Story worksheet collapses to one column',
    (await oneColumn('.rr-two-col')) === 1);

  // The meter must stay in sight without burying the task below the fold.
  const taskTop = await page.evaluate(() =>
    document.querySelector('#rr-main h1').getBoundingClientRect().top);
  check('the episode is reachable without scrolling past the instrument',
    taskTop < 850, `heading at y=${Math.round(taskTop)}`);
  await page.screenshot({ path: 'dev/shot-mobile.png' });

  await page.fill('#rr-fact', 'a'); await page.fill('#rr-story', 'b');
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.getByRole('button', { name: /He's agreed to meet/ }).click();
  await page.waitForSelector('#rr-reply');
  check('episode two: no horizontal overflow at 390px', (await overflowNow()) <= 0);
  check('trust rail moves above the transcript on mobile',
    await page.evaluate(() => {
      const rail = document.querySelector('.rr-rail')?.getBoundingClientRect();
      const main = document.querySelector('#rr-main')?.getBoundingClientRect();
      return !!rail && !!main && rail.top < main.top;
    }));
});

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
