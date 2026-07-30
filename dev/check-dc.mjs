/**
 * Boots the real .dc.html through the real support.js.
 *
 * React comes from node_modules rather than unpkg (blocked here), injected as
 * window.React/window.ReactDOM before page scripts run — loadReactUmd() then
 * short-circuits, so the file under test is the unmodified artifact.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join('dc', path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const reactGlobals = await readFile('dev/react-globals.js', 'utf8');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.addInitScript({ content: reactGlobals });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const missing = [];
page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });

const out = [];
const check = (n, p, d = '') => { out.push(p); console.log(`${p ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`); };

console.log('\nThe .dc.html through the real dc-runtime\n');
await page.goto(`${base}/Relationship%20Room.dc.html`);

await page.waitForSelector('.rr-app', { timeout: 15000 });
check('the runtime mounts the x-imported component', true);

// The hook check that matters: two Reacts would throw "Invalid hook call".
check('hooks run against the runtime\'s React',
  !errors.some((e) => /Invalid hook call|Minified React error #(321|31)/.test(e)),
  errors.find((e) => /hook/i.test(e)) ?? '');

check('it renders the intro, not a placeholder',
  (await page.locator('.rr-intro').count()) === 1
  && (await page.locator('.sc-placeholder').count()) === 0);

// No REHEARSAL note here: Claude Design proxies the API, so the personas are live.
check('this build expects the live client', (await page.locator('.rr-mode').count()) === 0);

// State must survive — proves hooks and the reducer work under the runtime.
await page.getByRole('button', { name: /Open the account file/ }).click();
await page.waitForSelector('.rr-email');
await page.getByRole('button', { name: /Something's landed/ }).click();
await page.waitForSelector('#rr-fact');
check('navigation and state work under the runtime', true);

const zone = await page.textContent('.rr-zone-now strong');
check('the Trust Meter renders its zone', zone.trim() === 'Neutral', zone.trim());

await page.screenshot({ path: 'dev/shot-dc.png' });
console.log(`  · 404s: ${missing.join(', ') || 'none'}`);
const real = errors.filter((e) => !/favicon|fonts\.|ERR_|net::|404/.test(e));
check('no runtime errors', real.length === 0, real.slice(0, 2).join(' | '));
check('every resource the page asks for exists',
  missing.every((p) => p === '/favicon.ico'), missing.join(', ') || 'none');

await browser.close(); server.close();
const failed = out.filter((x) => !x).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
