// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Prepares the tests in a real VS Code (.vscode-test.mjs). It bundles each test of test/vscode/ to
// out/test/vscode/<name>.test.js; the module `vscode` comes from the extension host, and mocha from @vscode/test-cli.
// It writes the user settings of each run (out/test/user-data/<label>/User/settings.json): the log of the TypeScript
// server, which the tests read, and for the run "workspace-typescript" the TypeScript of the examples
// (typescript.tsdk), as the settings of a course container set it. And it writes the workspace of the run "install",
// a course whose packages are not installed (out/test/install/course), and the workspace of the run "loose" in the
// temporary folder of the system (LOOSE_WORKSPACE of .vscode-test.mjs), so that no package.json of this repository lies
// above it.
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
  loose: {},
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

const { LOOSE_WORKSPACE } = await import('../.vscode-test.mjs');
const program = [
  '// A program for the tests of the debug type ts.',
  'import { Dog } from "./dog.ts";',
  'const dog = new Dog(process.argv[2] ?? "Rex");',
  'console.log(dog.bark());',
  'console.log(`cwd ${process.cwd()}`);',
  '',
].join('\n');
const dog = ['export class Dog {', '  constructor(private name: string) {}', '  bark(): string {', '    return `${this.name}: Woof`;', '  }', '}', ''].join('\n');
const debugFiles = {
  'loose/main.ts': program,
  'loose/dog.ts': dog,
  'loose/broken.ts': 'const n: number = "x";\nconsole.log("ran");\n',
  'loose/ask.ts': 'import * as fs from "node:fs";\nfs.writeFileSync("answer.txt", prompt("Name?") ?? "");\n',
  'loose/check.ts': [
    'import { Dog } from "./dog";',
    'import { readFileSync } from "node:fs";',
    'document.title = "x";',
    'const name: string | null = prompt("Name?");',
    'console.log(process.argv, name, readFileSync, Dog);',
    '',
  ].join('\n'),
  'project/package.json': `${JSON.stringify({ name: 'project', private: true, type: 'module' }, null, 2)}\n`,
  'project/main.ts': program,
  'project/dog.ts': dog,
  // A project whose node_modules is a symbolic link to a folder of another name, so the runs lie elsewhere.
  'linked/package.json': `${JSON.stringify({ name: 'linked', private: true, type: 'module' }, null, 2)}\n`,
  'linked/main.ts': program,
  'linked/dog.ts': dog,
  'store/packages/.keep': '',
};
fs.rmSync(LOOSE_WORKSPACE, { recursive: true, force: true });
for (const [name, text] of Object.entries(debugFiles)) {
  fs.mkdirSync(path.dirname(path.join(LOOSE_WORKSPACE, name)), { recursive: true });
  fs.writeFileSync(path.join(LOOSE_WORKSPACE, name), text);
}
fs.symlinkSync(path.join('..', 'store', 'packages'), path.join(LOOSE_WORKSPACE, 'linked', 'node_modules'));
