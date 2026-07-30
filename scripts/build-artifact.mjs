/**
 * Builds the claude.ai artifact.
 *
 * The publish step wraps the file in its own <!doctype>/<head>/<body>, so this
 * emits page content only. Fonts are data URIs because the artifact CSP blocks
 * font CDNs and a linked webfont would fail silently to a system serif.
 */

import { build } from 'esbuild';
import { writeFile, stat } from 'node:fs/promises';
import { FONT_CSS } from '../src/generated/fonts.js';

const OUT = 'artifact/relationship-room.html';

const result = await build({
  entryPoints: ['src/artifact.jsx'],
  bundle: true, minify: true, format: 'iife', jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __RR_BUILTIN_KEY__: 'null' },
  write: false, logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');

/**
 * The Registry room is a deliberate single-theme world — an ink-slate war room
 * with ledger paper on the table. It commits rather than inverting, so the page
 * paints its own ground in both themes instead of inheriting the viewer's.
 */
const SHELL = `
${FONT_CSS}
:root, :root[data-theme="light"], :root[data-theme="dark"] { color-scheme: dark; }
html, body { margin: 0; min-height: 100%; background: #12181D; color: #D7D9CF; }
#root { min-height: 100vh; }
@media (prefers-color-scheme: light) { html, body { background: #12181D; } }
`;

await writeFile(OUT, `<style>${SHELL}</style>\n<div id="root"></div>\n<script>${js}</script>\n`, 'utf8');
const { size } = await stat(OUT);
console.log(`${OUT} — ${(size / 1024).toFixed(0)} KB, page content only`);
