/**
 * Checks the "don't ask me every run" behaviour, and that the two builds keep
 * their keys where they belong.
 *
 * Deliberately stops at the intro screen: nothing here calls the Messages API,
 * so running this never bills anyone.
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';

const SHARED = resolve('relationship-room.html');
const PERSONAL = resolve('relationship-room-personal.html');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const out = [];
const check = (n, p, d = '') => { out.push(p); console.log(`${p ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`); };
const apiCalls = [];
const watch = (page) => page.on('request', (r) => {
  if (r.url().includes('api.anthropic.com')) apiCalls.push(r.url());
});

console.log('\nSeamless-run behaviour\n');

/* ---- the shared build: ask once, then remember ---- */
let page = await browser.newPage();
watch(page);
await page.goto('file://' + SHARED);
await page.waitForSelector('.rr-gate');
check('shared build asks on first open', true);

check('the shared build carries no key of its own',
  !(await page.content()).includes('sk-ant-api03'));

await page.fill('#rr-key', 'sk-ant-test-not-a-real-key');
await page.getByRole('button', { name: /Open the account file/ }).click();
await page.waitForSelector('.rr-intro');
check('entering a key opens the Lab', true);

await page.reload();
await page.waitForTimeout(400);
check('every later run opens straight into the account file',
  (await page.locator('.rr-gate').count()) === 0);

await page.evaluate(() => localStorage.removeItem('relationship-room-key'));
await page.reload();
await page.waitForSelector('.rr-gate', { timeout: 5000 });
check('forgetting the key brings the gate back', true);
await page.close();

/* ---- the personal build: never asks ---- */
try {
  await access(PERSONAL);
  page = await browser.newPage();
  watch(page);
  await page.goto('file://' + PERSONAL);
  await page.waitForSelector('.rr-intro', { timeout: 5000 });
  check('personal build opens straight into the account file', true);

  // The key is inside the bundle by design; what matters is that it is never
  // put on screen where it can be shoulder-read or copied out of the page.
  const visible = await page.evaluate(() => document.body.innerText);
  check('the key is never displayed', !visible.includes('sk-ant-'));
  await page.close();
} catch {
  console.log('  – personal build not present (run `npm run build:personal`)');
}

check('no API calls made while merely opening', apiCalls.length === 0, `${apiCalls.length} calls`);

await browser.close();
const failed = out.filter((x) => !x).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
