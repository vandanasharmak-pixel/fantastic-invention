/**
 * Simulates the publish environment: the fragment wrapped in the platform's
 * own skeleton, with every outbound request blocked the way the artifact CSP
 * blocks them.
 */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const frag = await readFile('artifact/relationship-room.html', 'utf8');
// The platform supplies doctype/head/body and a minimal reset.
await writeFile('dev/artifact-wrapped.html',
  `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>*{box-sizing:border-box}body{margin:0}</style></head><body>${frag}</body></html>`);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const out = [];
const check = (n, p, d = '') => { out.push(p); console.log(`${p ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`); };

const openPage = async (theme) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, colorScheme: theme });
  const blocked = [];
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('file://') || u.startsWith('data:')) return r.continue();
    blocked.push(u); return r.abort();
  });
  page.on('pageerror', (e) => blocked.push('ERR ' + e.message));
  await page.goto('file://' + resolve('dev/artifact-wrapped.html'));
  return { page, blocked };
};

console.log('\nArtifact under publish conditions\n');

const { page, blocked } = await openPage('dark');
await page.waitForSelector('.rr-app', { timeout: 8000 });
check('renders inside the publish skeleton', true);
check('makes no outbound request at all', blocked.length === 0, blocked.slice(0, 2).join(' | '));

check('opens straight into the Lab — no key field',
  (await page.locator('.rr-gate').count()) === 0 && (await page.locator('.rr-intro').count()) === 1);
check('says plainly which mode it is in',
  /REHEARSAL/.test(await page.textContent('.rr-mode')));

await page.evaluate(() => document.fonts.ready);
const faces = await page.evaluate(() =>
  [...document.fonts].filter((f) => f.status === 'loaded').length);
check('typography loads from inlined data URIs', faces > 0, `${faces} faces`);

// Play far enough to prove the mechanic works with zero network.
await page.getByRole('button', { name: /Open the account file/ }).click();
await page.getByRole('button', { name: /Something's landed/ }).click();
await page.fill('#rr-fact', 'He wrote that "on track" without evidence does not settle him.');
await page.fill('#rr-story', 'That he has decided we are failing.');
await page.getByRole('button', { name: 'Compare' }).click();
await page.waitForSelector('.rr-coach', { timeout: 8000 });
await page.getByRole('button', { name: /He's agreed to meet/ }).click();
await page.waitForSelector('#rr-reply');

const say = async (t) => {
  await page.fill('#rr-reply', t);
  await page.locator('.rr-compose button').click();
  await page.waitForFunction(() => !document.querySelector('.rr-waiting'), null, { timeout: 8000 });
};
const zone = async () => (await page.textContent('.rr-zone-now strong')).trim();

await say("We're tracking well — I'm confident we'll hit the Atlas date.");
check('reassurance costs trust', (await zone()) === 'Guarded', await zone());
await page.getByRole('button', { name: /Call Hold/ }).click();
await page.waitForSelector('.rr-void-stamp', { timeout: 8000 });
await say("You're right that we've gone quiet on you, and that's on us.");
check('hold and replay work with no network', (await zone()) === 'Neutral', await zone());
check('the first take is struck, not deleted',
  (await page.locator('.rr-turn.rr-struck').count()) === 2);

check('no sideways scroll', await page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await page.screenshot({ path: 'dev/shot-artifact.png' });
await page.close();

// A light-theme viewer must still get the committed dark room, not a half-inverted one.
const light = await openPage('light');
await light.page.waitForSelector('.rr-app', { timeout: 8000 });
const bg = await light.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('a light-theme viewer still gets the committed dark room', bg === 'rgb(18, 24, 29)', bg);
await light.page.close();

await browser.close();
const failed = out.filter((x) => !x).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
