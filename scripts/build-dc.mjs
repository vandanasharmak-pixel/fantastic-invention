/**
 * Builds the module the .dc.html x-imports.
 *
 * CJS, because support.js reads `module.exports[name]`. React is aliased to a
 * shim over the runtime's injected instance rather than bundled — see
 * src/dc-react-shim.js. Classic JSX for the same reason: the automatic runtime
 * would pull in react/jsx-runtime, which the shim does not cover.
 */

import { build } from 'esbuild';
import { stat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('dc', { recursive: true });
const OUT = 'dc/relationship-room.dc.js';

await build({
  entryPoints: ['src/dc.jsx'],
  outfile: OUT,
  bundle: true, minify: true, format: 'cjs',
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  loader: { '.jsx': 'jsx' },
  alias: { react: resolve('src/dc-react-shim.js') },
  define: { 'process.env.NODE_ENV': '"production"', __RR_BUILTIN_KEY__: 'null' },
  logLevel: 'warning',
});

const { size } = await stat(OUT);
console.log(`${OUT} — ${(size / 1024).toFixed(0)} KB (React supplied by the runtime)`);
