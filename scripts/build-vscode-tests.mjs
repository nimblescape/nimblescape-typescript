// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Prepares the tests in a real VS Code (.vscode-test.mjs). It bundles each test of test/vscode/ to
// out/test/vscode/<name>.test.js; the module `vscode` comes from the extension host, and mocha from @vscode/test-cli.
// It writes the user settings of each run (out/test/user-data/<label>/User/settings.json): the log of the TypeScript
// server, which the tests read, and for the run "workspace-typescript" the TypeScript of the examples
// (typescript.tsdk), as the settings of a course container set it. And it writes the workspace of the run "install",
// a course whose packages are not installed (out/test/install/course).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'test', 'vscode');
const out = path.join(root, 'out', 'test');

fs.rmSync(out, { recursive: true, force: true });
await esbuild.build({
  entryPoints: fs.readdirSync(source).filter((name) => name.endsWith('.test.ts')).map((name) => path.join(source, name)),
  outdir: path.join(out, 'vscode'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  external: ['vscode', 'mocha'],
  logLevel: 'info',
});

const settings = {
  vscode: {},
  'workspace-typescript': { 'typescript.tsdk': path.join(root, 'examples', 'node_modules', 'typescript', 'lib') },
  install: {},
};
for (const [label, own] of Object.entries(settings)) {
  const folder = path.join(out, 'user-data', label, 'User');
  fs.mkdirSync(folder, { recursive: true });
  const common = { 'typescript.tsserver.log': 'normal', 'workbench.startupEditor': 'none', 'telemetry.telemetryLevel': 'off' };
  fs.writeFileSync(path.join(folder, 'settings.json'), `${JSON.stringify({ ...common, ...own }, null, 2)}\n`);
}

const course = path.join(out, 'install', 'course');
fs.mkdirSync(course, { recursive: true });
fs.writeFileSync(path.join(course, 'package.json'), `${JSON.stringify({ name: 'course', private: true, devDependencies: { typescript: '6.0.3' } }, null, 2)}\n`);
fs.writeFileSync(path.join(course, 'package-lock.json'), `${JSON.stringify({ name: 'course', lockfileVersion: 3, requires: true, packages: {} }, null, 2)}\n`);
