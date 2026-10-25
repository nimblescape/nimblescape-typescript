// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Builds the extension and the TypeScript server plugin (both Node.js, CommonJS) into dist/, and the command ts with
// its two preload modules into cli/dist/, the files of the npm package @nimblescape/typescript, which the package of
// the extension holds too. VS Code provides the
// module `vscode` at run time, so the bundle of the extension leaves it out. The plugin gets the TypeScript module from
// the TypeScript server that loads it, so its bundle contains no TypeScript: src/autoImportFilter.ts imports it for
// its types only. plugin/package.json names dist/plugin.js as the plugin. Both bundles are readable JavaScript: not
// minified, so that they keep the names of the source and anyone can read the code of the package and compare it with
// the source (CONTRIBUTING.md, "Reviewing the package"). Only a development build writes source maps; a production
// build (--production, which vscode:prepublish passes) has none.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));

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

// The command ts runs on the Node.js of the PATH, which may be older than the runtime of VS Code: Node.js 22 or newer
// (engines of cli/package.json). Its version comes from the manifest of the extension; the release sets the same
// version in both manifests. BUNDLED_TYPESCRIPT is the TypeScript that ts installs offline (src/cli/install.ts): the
// pinned TypeScript of the development tools, which is the TypeScript of VS Code.
const cli = {
  ...common,
  entryPoints: ['src/cli/ts.ts'],
  outfile: 'cli/dist/ts.js',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  define: {
    TS_VERSION: JSON.stringify(manifest.version),
    BUNDLED_TYPESCRIPT: JSON.stringify(manifest.devDependencies.typescript),
  },
};

// prompt(), alert() and confirm(), and the clean terminal of a debug session: ES modules for node --import.
const preloads = {
  ...common,
  entryPoints: { polyfill: 'src/runtime/polyfill.ts', 'debug-terminal': 'src/runtime/debugTerminal.ts' },
  outdir: 'cli/dist',
  outExtension: { '.js': '.mjs' },
  format: 'esm',
  target: 'node22',
};

mkdirSync('dist', { recursive: true });
mkdirSync('cli/dist', { recursive: true });
// npm puts the license of the folder of a package into the package.
copyFileSync('LICENSE', 'cli/LICENSE');
// No map of an earlier development build may stay next to a bundle of a production build.
if (production) {
  const maps = ['dist/extension.js.map', 'dist/plugin.js.map', 'cli/dist/ts.js.map', 'cli/dist/polyfill.mjs.map', 'cli/dist/debug-terminal.mjs.map'];
  for (const file of maps) rmSync(file, { force: true });
}

if (watch) {
  const contexts = await Promise.all([extension, plugin, cli, preloads].map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([extension, plugin, cli, preloads].map((b) => esbuild.build(b)));
}
