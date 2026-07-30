/**
 * Opens the built single file the way a person would — straight off disk, no
 * server — and plays the rehearsal through to the debrief.
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';

const FILE = 'file://' + resolve('relationship-room.html');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('file://') && !u.startsWith('data:')) errors.push(`NETWORK: ${u}`);
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\nOpening ${FILE}\n`);
await page.goto(FILE);
await page.waitForSelector('.rr-gate');

check('the gate renders from a bare file:// origin', true);
check('it offers a no-key path',
  (await page.textContent('.rr-gate')).includes('Rehearse without a key'));
check('the key field is a password input',
  (await page.getAttribute('#rr-key', 'type')) === 'password');
check('it says where the key goes',
  /api\.anthropic\.com/.test(await page.textContent('.rr-warn')));

await page.getByRole('button', { name: /Run the rehearsal/ }).click();
await page.waitForSelector('.rr-intro');
check('rehearsal starts without a key', true);

await page.getByRole('button', { name: /Open the account file/ }).click();
await page.getByRole('button', { name: /Something's landed/ }).click();
await page.fill('#rr-fact', 'He wrote that "on track" without evidence does not settle him.');
await page.fill('#rr-story', 'That he has decided we are failing.');
await page.getByRole('button', { name: 'Compare' }).click();
await page.waitForSelector('.rr-coach', { timeout: 8000 });
check('the facilitator answers offline', (await page.textContent('.rr-coach')).length > 60);

await page.getByRole('button', { name: /He's agreed to meet/ }).click();
await page.waitForSelector('#rr-reply');

const say = async (t) => {
  await page.fill('#rr-reply', t);
  await page.locator('.rr-compose button').click();
  await page.waitForFunction(() => !document.querySelector('.rr-waiting'), null, { timeout: 8000 });
};

const zone = () => page.textContent('.rr-zone-now strong');

await say("We're tracking well — I'm confident we'll hit the Atlas date.");
check('the scripted client punishes reassurance', (await zone()).trim() === 'Guarded',
  (await zone()).trim());

await page.getByRole('button', { name: /Call Hold/ }).click();
await page.waitForSelector('.rr-void-stamp', { timeout: 8000 });
await say("You're right that we've gone quiet on you, and that's on us.");
check('hold and replay work offline', (await zone()).trim() === 'Neutral', (await zone()).trim());
check('the first take is struck, not deleted',
  (await page.locator('.rr-turn.rr-struck').count()) === 2);

// Persistence from a file:// origin, where localStorage may be unavailable.
const storage = await page.evaluate(() => {
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
    return { available: true, saved: !!localStorage.getItem('relationship-room') };
  } catch (e) { return { available: false, reason: e.name }; }
});
check('localStorage works on file:// (progress is saved)',
  storage.available, storage.available ? `saved=${storage.saved}` : storage.reason);

await page.screenshot({ path: 'dev/shot-standalone.png' });

const real = errors.filter((e) => !/fonts\.googleapis|fonts\.gstatic|ERR_|favicon/.test(e));
check('no runtime errors and no unexpected network calls', real.length === 0,
  real.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
