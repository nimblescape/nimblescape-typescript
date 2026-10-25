// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the built command ts (cli/dist/ts.js, npm run test:cli) on Linux and macOS. Each test writes a small
// folder into the temporary folder of the system and runs ts there with the Node.js of the tests, as a student runs it
// in a terminal. The TypeScript is the pinned TypeScript of the development tools, given as the TypeScript of VS Code
// (NIMBLESCAPE_TS_TYPESCRIPT), so the tests do not depend on a global TypeScript of the computer.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectOfFile } from '../../src/cli/compile.ts';
import { compiledFile } from '../../src/cli/run.ts';

const repository = path.resolve(import.meta.dirname, '../..');
const ts = path.join(repository, 'cli', 'dist', 'ts.js');
const typescript = path.join(repository, 'node_modules', 'typescript');

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

/** A temporary folder with files, given as paths relative to the folder and their text. */
function tree(files: Record<string, string>): string {
  // The real path: on macOS the temporary folder is a symbolic link, and ts prints real paths.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-cli-')));
  folders.push(root);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

/** Runs ts in `cwd` with the arguments and the input; returns its exit code and its output. */
function runTs(cwd: string, args: string[], input = '', environment: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [ts, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, NIMBLESCAPE_TS_TYPESCRIPT: typescript, ...environment },
    timeout: 60_000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

const DOG = [
  'export class Dog {',
  '  constructor(private name: string) {}',
  '  bark(): string { return `${this.name}: Woof`; }',
  '}',
  'export enum Size { Small, Large }',
  'export interface Pet { name: string }',
  '',
].join('\n');

describe('ts in a folder without tsconfig.json and package.json', () => {
  it('runs main.ts with enums, parameter properties, plain type imports, top-level await and prompt()', () => {
    const folder = tree({
      'dog.ts': DOG,
      'main.ts': [
        'import { Dog, Size, Pet } from "./dog.ts";',
        'const pet: Pet = { name: prompt("Name?", "Rex") ?? "" };',
        'console.log(new Dog(pet.name).bark(), Size.Large, process.argv.slice(2).join(","));',
        'console.log(await Promise.resolve(confirm("Sure?")));',
      ].join('\n'),
    });
    const result = runTs(folder, ['main.ts', 'a', '--b'], 'Fido\ny\n');
    expect(result.output).toContain('Name? [Rex] Fido\n');
    expect(result.output).toContain('Fido: Woof 1 a,--b\n');
    expect(result.output).toContain('Sure? [y/N] y\ntrue\n');
    expect(result.code).toBe(0);
    // Without a file, ts runs main.ts.
    expect(runTs(folder, [], 'Bello\n').output).toContain('Bello: Woof');
  });

  it('stops at a type error, with the message of tsc, and runs nothing', () => {
    const folder = tree({ 'main.ts': 'console.log("started");\nconst n: number = "x";\ndocument.title = "x";\n' });
    const result = runTs(folder, ['main.ts']);
    expect(result.code).toBe(1);
    expect(result.output).toContain("main.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(result.output).toContain("main.ts(3,1): error TS2584: Cannot find name 'document'.");
    expect(result.output).not.toContain('started');
  });

  it('refuses an import without the extension, as Node.js does', () => {
    const folder = tree({ 'dog.ts': DOG, 'main.ts': 'import { Dog } from "./dog";\nnew Dog("a");\n' });
    expect(runTs(folder, ['main.ts']).output).toContain('error TS2835');
  });

  it('accepts an optional property set to undefined, as tsc without a tsconfig.json does', () => {
    const folder = tree({ 'main.ts': 'interface P { nick?: string }\nconst p: P = { nick: undefined };\nconsole.log(p);\n' });
    expect(runTs(folder, ['main.ts'])).toMatchObject({ code: 0, stdout: '{ nick: undefined }\n' });
  });

  it('shows the line of the .ts file in an error of the program, and ends with its exit code', () => {
    const folder = tree({
      'main.ts': 'function fail(): never {\n  throw new Error("boom");\n}\nif (process.argv[2] === "exit") process.exit(3);\nfail();\n',
    });
    const crash = runTs(folder, ['main.ts']);
    expect(crash.code).toBe(1);
    expect(crash.stderr).toContain(`${path.join(folder, 'main.ts')}:2:9`);
    expect(runTs(folder, ['main.ts', 'exit']).code).toBe(3);
  });

  it('leaves no folder of the run behind', () => {
    const folder = tree({ 'main.ts': 'console.log(process.pid);\n' });
    const cache = path.join(os.tmpdir(), `nimblescape-ts-${os.userInfo().uid}`);
    const before = fs.existsSync(cache) ? fs.readdirSync(cache) : [];
    expect(runTs(folder, ['main.ts']).code).toBe(0);
    expect(fs.existsSync(cache) ? fs.readdirSync(cache) : []).toEqual(before);
    expect(fs.readdirSync(folder)).toEqual(['main.ts']);
  });

  it('keeps the folder of the runs in the temporary folder for this user only', () => {
    const folder = tree({ 'main.ts': 'import * as fs from "node:fs";\nconsole.log((fs.statSync(process.argv[2]).mode & 0o777).toString(8));\n' });
    const cache = path.join(os.tmpdir(), `nimblescape-ts-${os.userInfo().uid}`);
    expect(runTs(folder, ['main.ts', cache])).toMatchObject({ code: 0, stdout: '700\n' });
    if (process.getuid?.() !== 0) return;
    // Only root can give the folder to another user: ts refuses it, with a message and without a stack.
    const before = fs.existsSync(cache);
    fs.mkdirSync(cache, { recursive: true });
    fs.chownSync(cache, 4242, 4242);
    try {
      const result = runTs(folder, ['main.ts', cache]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe(`ts: The folder ${fs.realpathSync(cache)} belongs to another user. Delete it, then run ts again.\n`);
    } finally {
      fs.chownSync(cache, 0, 0);
      if (!before) fs.rmSync(cache, { recursive: true, force: true });
    }
  });

  it('runs in the folder of the run that the debug type ts names, and hides its variables from the program', () => {
    const folder = tree({ 'main.ts': 'console.log(process.argv[1]);\nconsole.log(process.env.NIMBLESCAPE_TS_RUN ?? "none");\n' });
    const name = `${process.pid}-abc123`;
    const result = runTs(folder, ['main.ts'], '', { NIMBLESCAPE_TS_RUN: name, NIMBLESCAPE_TS_DEBUG: '1' });
    // The debug type gives js-debug this path for stopOnEntry before ts starts.
    expect(result).toMatchObject({ code: 0, stdout: `${compiledFile(projectOfFile(path.join(folder, 'main.ts')), name)}\nnone\n` });
  });

  it('checks with --check and runs nothing', () => {
    const folder = tree({ 'main.ts': 'console.log("ran");\n', 'bad.ts': 'const n: number = "x";\n' });
    expect(runTs(folder, ['--check', 'main.ts'])).toMatchObject({ code: 0, stdout: '' });
    expect(runTs(folder, ['--check', 'bad.ts']).code).not.toBe(0);
  });
});

describe('ts in a project', () => {
  it('finds the packages of the project and leaves its node_modules as it was', () => {
    const folder = tree({
      'package.json': JSON.stringify({ type: 'module', dependencies: { shout: '1.0.0' } }),
      'node_modules/shout/package.json': JSON.stringify({ name: 'shout', version: '1.0.0', type: 'module', exports: './index.js', types: './index.d.ts' }),
      'node_modules/shout/index.js': 'export const shout = (s) => s.toUpperCase();\n',
      'node_modules/shout/index.d.ts': 'export declare const shout: (s: string) => string;\n',
      'workspace/main.ts': 'import { shout } from "shout";\nconsole.log(shout("hello"));\n',
    });
    const result = runTs(path.join(folder, 'workspace'), ['main.ts']);
    expect(result).toMatchObject({ code: 0, stdout: 'HELLO\n' });
    expect(fs.readdirSync(path.join(folder, 'node_modules'))).toEqual(['shout']);
  });

  it('names the .ts file in an error and for stopOnEntry when node_modules is a symbolic link', () => {
    const folder = tree({
      'store/packages/.keep': '',
      'course/package.json': JSON.stringify({ type: 'module' }),
      'course/main.ts': 'console.log(process.argv[1]);\nthrow new Error("boom");\n',
    });
    fs.symlinkSync(path.join('..', 'store', 'packages'), path.join(folder, 'course', 'node_modules'));
    const name = `${process.pid}-def456`;
    const result = runTs(path.join(folder, 'course'), ['main.ts'], '', { NIMBLESCAPE_TS_RUN: name });
    // The source map names course/main.ts, not a file next to the folder that the link points to.
    expect(result.stderr).toContain(`${path.join(folder, 'course', 'main.ts')}:2:7`);
    const compiled = compiledFile(projectOfFile(path.join(folder, 'course', 'main.ts')), name);
    expect(result.stdout).toBe(`${compiled}\n`);
    expect(compiled.startsWith(path.join(folder, 'store', 'packages', '.cache', 'ts'))).toBe(true);
    // ts deletes the folders that it created behind the link.
    expect(fs.readdirSync(path.join(folder, 'store', 'packages'))).toEqual(['.keep']);
  });

  it('stops when the packages of the project are not installed and nobody can answer', () => {
    const folder = tree({ 'package.json': JSON.stringify({ dependencies: { shout: '1.0.0' } }), 'main.ts': '' });
    const result = runTs(folder, ['main.ts']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The packages of this course are not installed (shout). Run npm install in .');
  });

  it('uses the tsconfig.json of the project and keeps its declaration files', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true, types: [] } }),
      'globals.d.ts': 'declare function shout(text: string): string;\n',
      'a/main.ts': 'const text: string = shout("x");\n',
      'a/other.ts': 'const broken: number = "not checked";\n',
    });
    expect(runTs(path.join(folder, 'a'), ['--check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
    // A project without references is checked with --noEmit, and a file elsewhere in it breaks the check.
    expect(runTs(folder, ['--check']).output).toContain('a/other.ts');
  });
});

describe('ts --init', () => {
  it('writes the tsconfig.json of tsc --init for Node.js and refuses to replace it', () => {
    const folder = tree({});
    const first = runTs(folder, ['--init']);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('Created a new tsconfig.json');
    const text = fs.readFileSync(path.join(folder, 'tsconfig.json'), 'utf8');
    expect(text).toContain('"lib": ["esnext"],');
    expect(text).toContain('"types": ["node"],');
    expect(text).not.toContain('noUncheckedIndexedAccess');
    const second = runTs(folder, ['--init']);
    expect(second.code).toBe(1);
    expect(second.stderr).toContain('error TS5054');
  });
});

describe('ts --completion', () => {
  it('prints scripts that the shells can read', () => {
    for (const shell of ['bash', 'zsh'] as const) {
      const script = runTs(os.tmpdir(), ['--completion', shell]).stdout;
      const check = spawnSync(shell, ['-n'], { input: script, encoding: 'utf8' });
      // A computer without the shell skips its check.
      if (check.error) continue;
      expect(check.status, check.stderr).toBe(0);
    }
  });
});

describe('ts --version and --help', () => {
  it('names the versions of ts, TypeScript and Node.js', () => {
    const result = runTs(os.tmpdir(), ['--version']);
    expect(result.stdout).toMatch(/^ts \d+\.\d+\.\d+\nTypeScript 6\.\d+\.\d+ \(of VS Code, .*\)\nNode\.js v\d+/);
    expect(runTs(os.tmpdir(), ['--help']).stdout).toContain('Usage:');
  });
});
