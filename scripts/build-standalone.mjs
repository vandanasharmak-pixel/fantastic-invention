/**
 * Bundles the whole Lab into one self-contained HTML file.
 *
 * No build step, no server, no module loading — a file you can email someone
 * and they can double-click. React is bundled in production mode; the webfonts
 * are the only network request, and every stack falls back to a system face if
 * they don't load.
 */

import { build } from 'esbuild';
import { writeFile, stat } from 'node:fs/promises';

const OUT = 'relationship-room.html';

const result = await build({
  entryPoints: ['src/standalone.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  logLevel: 'warning',
});

const js = result.outputFiles[0].text;

// `</script>` inside a string literal would close the tag early.
const safe = js.replace(/<\/script>/gi, '<\\/script>');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Relationship Room — a practice lab</title>
<meta name="description" content="A five-episode simulation in protecting a strategic client relationship.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="%2312181D"/><circle cx="16" cy="16" r="9" fill="none" stroke="%23C7C1B0" stroke-width="2"/><path d="M16 16 L16 8" stroke="%23C0453A" stroke-width="2"/></svg>',
)}">
<style>
  html,body{margin:0;height:100%;background:#12181D;color:#D7D9CF}
  #root{min-height:100%}
  /* Shown only if the bundle fails to run at all. */
  .rr-noscript{max-width:34em;margin:14vh auto;padding:0 22px;
    font:400 16px/1.6 Georgia,serif;color:#B9C3CB}
</style>
</head>
<body>
<div id="root"><noscript><div class="rr-noscript">
  <h1>The Relationship Room</h1>
  <p>This practice lab needs JavaScript — it is an interactive simulation
  rather than a document. Enable it for this file and reload.</p>
</div></noscript></div>
<script>${safe}</script>
</body>
</html>
`;

await writeFile(OUT, html, 'utf8');
const { size } = await stat(OUT);
console.log(`${OUT} — ${(size / 1024).toFixed(0)} KB, self-contained`);
