// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Builds the extension and the TypeScript server plugin (both Node.js, CommonJS) into dist/. VS Code provides the
// module `vscode` at run time, so the bundle of the extension leaves it out. The plugin gets the TypeScript module from
// the TypeScript server that loads it, so its bundle contains no TypeScript: src/autoImportFilter.ts imports it for
// its types only. plugin/package.json names dist/plugin.js as the plugin. Both bundles are readable JavaScript: not
// minified, so that they keep the names of the source and anyone can read the code of the package and compare it with
// the source (CONTRIBUTING.md, "Reviewing the package"). Only a development build writes source maps; a production
// build (--production, which vscode:prepublish passes) has none.
import * as esbuild from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: !production,
  minify: false,
  logLevel: 'info',
};

const extension = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
};

// VS Code runs the TypeScript server with its own Node.js, the runtime of the extensions; the setting
// typescript.tsserver.nodePath can name another Node.js, so the plugin keeps to the language of Node.js 22.
const plugin = {
  ...common,
  entryPoints: ['src/plugin.ts'],
  outfile: 'dist/plugin.js',
  target: 'node22',
};

mkdirSync('dist', { recursive: true });
// No map of an earlier development build may stay next to a bundle of a production build.
if (production) for (const file of ['dist/extension.js.map', 'dist/plugin.js.map']) rmSync(file, { force: true });

if (watch) {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(plugin)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([extension, plugin].map((b) => esbuild.build(b)));
}
