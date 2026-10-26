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

/** The entry of compilerOptions.plugins that ts init writes: it marks a project of ts. */
const TS_PROJECT = [{ name: 'nimblescape-typescript-plugin' }];

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

  it('hides the variable of the debug type from the program, and runs on with stopOnEntry when no debugger listens', () => {
    const folder = tree({
      'main.ts': 'function first(): number {\n  return 1;\n}\nconsole.log(first(), process.env.NIMBLESCAPE_TS_DEBUG ?? "none");\n',
    });
    for (const value of ['1', 'stop-on-entry']) {
      expect(runTs(folder, ['main.ts'], '', { NIMBLESCAPE_TS_DEBUG: value })).toMatchObject({ code: 0, stdout: '1 none\n', stderr: '' });
    }
  });

  it('checks with ts check and runs nothing', () => {
    const folder = tree({ 'main.ts': 'console.log("ran");\n', 'bad.ts': 'const n: number = "x";\n' });
    expect(runTs(folder, ['check', 'main.ts'])).toMatchObject({ code: 0, stdout: '' });
    expect(runTs(folder, ['check', 'bad.ts']).code).not.toBe(0);
  });

  it('runs a JavaScript file with prompt() and imports, and checks its types only with // @ts-check, as Deno does', () => {
    const CHANGE = 'let n = 1;\nn = "one";\nconsole.log(typeof n);\n';
    const folder = tree({
      'lib.js': 'export function double(n) {\n  return n * 2;\n}\n',
      'main.js': 'import { double } from "./lib.js";\nconst name = prompt("Name?", "Ada");\nconsole.log(double(2), name);\n',
      'main.ts': 'import { double } from "./lib.js";\nconsole.log(double(3));\n',
      'plain.js': CHANGE,
      'checked.js': `// @ts-check\n${CHANGE}`,
      'broken.js': 'const = 1;\n',
    });
    expect(runTs(folder, ['main.js'], 'Bob\n')).toMatchObject({ code: 0, stdout: 'Name? [Ada] Bob\n4 Bob\n' });
    // A TypeScript file may import a JavaScript file.
    expect(runTs(folder, ['main.ts'])).toMatchObject({ code: 0, stdout: '6\n' });
    expect(runTs(folder, ['plain.js'])).toMatchObject({ code: 0, stdout: 'string\n' });
    const checked = runTs(folder, ['checked.js']);
    expect(checked.code).toBe(1);
    expect(checked.output).toContain("checked.js(3,1): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(checked.output).not.toContain('string\n');
    // tsc checks the syntax of every JavaScript file.
    expect(runTs(folder, ['broken.js']).output).toContain('broken.js(1,7): error TS1134');
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

  it('names the .ts file in an error when node_modules is a symbolic link', () => {
    const folder = tree({
      'store/packages/.keep': '',
      'course/package.json': JSON.stringify({ type: 'module' }),
      'course/main.ts': 'console.log(process.argv[1]);\nthrow new Error("boom");\n',
    });
    fs.symlinkSync(path.join('..', 'store', 'packages'), path.join(folder, 'course', 'node_modules'));
    const result = runTs(path.join(folder, 'course'), ['main.ts']);
    // The source map names course/main.ts, not a file next to the folder that the link points to.
    expect(result.stderr).toContain(`${path.join(folder, 'course', 'main.ts')}:2:7`);
    // Node.js runs the compiled file by its real path, behind the link.
    expect(result.stdout.startsWith(path.join(folder, 'store', 'packages', '.cache', 'ts'))).toBe(true);
    // ts deletes the folders that it created behind the link.
    expect(fs.readdirSync(path.join(folder, 'store', 'packages'))).toEqual(['.keep']);
  });

  it('runs a module under a package.json without "type", whether tsc writes an ES module or CommonJS', () => {
    const files = {
      'package.json': JSON.stringify({ name: 'course' }),
      // `this` of a module is undefined in an ES module and module.exports in CommonJS.
      'a/main.ts': 'import { Dog } from "./dog.ts";\nexport const rex = new Dog("Rex");\nconsole.log(rex.bark(), String(this));\n',
      'a/dog.ts': DOG,
    };
    // tsconfig.json without "module": tsc writes an ES module, which Node.js recognizes by its syntax.
    const esm = tree({ ...files, 'a/tsconfig.json': JSON.stringify({ compilerOptions: { target: 'esnext', rewriteRelativeImportExtensions: true } }) });
    expect(runTs(path.join(esm, 'a'), ['main.ts'])).toMatchObject({ code: 0, stdout: 'Rex: Woof undefined\n', stderr: '' });
    // The defaults of ts (module nodenext): tsc writes CommonJS, as for a package.json without "type".
    const commonJs = tree(files);
    expect(runTs(path.join(commonJs, 'a'), ['main.ts'])).toMatchObject({ code: 0, stdout: 'Rex: Woof [object Object]\n', stderr: '' });
  });

  it('runs a CommonJS program with stopOnEntry as without it, when no debugger listens', () => {
    const folder = tree({
      'package.json': JSON.stringify({ name: 'course', type: 'commonjs' }),
      'main.ts': [
        'import { Dog } from "./dog.ts";',
        'console.log(new Dog("Rex").bark(), require.main === module, __filename.endsWith("main.js"));',
        'import("./dog.ts").then((dog) => console.log(typeof dog.Dog));',
        'setTimeout(() => { throw new Error("boom"); }, 100);',
        '',
      ].join('\n'),
      'dog.ts': DOG,
    });
    const result = runTs(folder, ['main.ts'], '', { NIMBLESCAPE_TS_DEBUG: 'stop-on-entry' });
    expect(result.stdout).toBe('Rex: Woof true true\nfunction\n');
    // The source map of tsc still names the line of the .ts file.
    expect(result.stderr).toContain(`${path.join(folder, 'main.ts')}:4:26`);
  });

  // Without a debugger, callAndPauseOnStart only calls the function. The code of the main module then runs in the
  // function of stop-on-entry.mjs, inside the function of Node.js: two frames of the main module, of which the outer
  // one has no place in main.ts and names main.js. Node.js 22 compiles a CommonJS module whose source a hook gave
  // without Module.prototype._compile.
  it('runs the code of a CommonJS main module in the function that pauses, with stopOnEntry', () => {
    const folder = tree({
      'package.json': JSON.stringify({ name: 'course', type: 'commonjs' }),
      'main.ts': 'console.log(new Error().stack?.split("\\n").filter((line) => /main\\.[jt]s:/.test(line)).length);\n',
    });
    expect(runTs(folder, ['main.ts'], '', { NIMBLESCAPE_TS_DEBUG: '1' }).stdout).toBe('1\n');
    expect(runTs(folder, ['main.ts'], '', { NIMBLESCAPE_TS_DEBUG: 'stop-on-entry' }).stdout).toBe('2\n');
  });

  it('stops when the packages of the project are not installed and nobody can answer', () => {
    const folder = tree({ 'package.json': JSON.stringify({ dependencies: { shout: '1.0.0' } }), 'main.ts': '' });
    const result = runTs(folder, ['main.ts']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The packages of this course are not installed (shout). Run npm install in this folder.\n');
  });

  it('uses the tsconfig.json of the project and keeps its declaration files', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true, types: [] } }),
      'globals.d.ts': 'declare function shout(text: string): string;\n',
      'a/main.ts': 'const text: string = shout("x");\n',
      'a/other.ts': 'const broken: number = "not checked";\n',
    });
    expect(runTs(path.join(folder, 'a'), ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
    // A project without references is checked with --noEmit, and a file elsewhere in it breaks the check.
    expect(runTs(folder, ['check']).output).toContain('a/other.ts');
  });
});

describe('ts with a tsconfig.json and without a package.json', () => {
  it('runs a JavaScript file also when the tsconfig.json does not allow JavaScript', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true, types: [] } }),
      'main.js': 'console.log("JavaScript");\n',
    });
    expect(runTs(folder, ['main.js'])).toMatchObject({ code: 0, stdout: 'JavaScript\n', stderr: '' });
  });

  it('finds the type packages of the project folder, and every file of a project of ts is an ES module, as in Deno', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true, verbatimModuleSyntax: true, types: ['node'], plugins: TS_PROJECT } }),
      'main.ts': 'import { readFileSync } from "node:fs";\nimport { twice } from "./twice.ts";\nconsole.log(typeof readFileSync, typeof module, twice(2));\n',
      'twice.ts': 'export function twice(value: number): number {\n  return 2 * value;\n}\n',
    });
    fs.mkdirSync(path.join(folder, 'node_modules', '@types'), { recursive: true });
    fs.symlinkSync(path.join(repository, 'node_modules', '@types', 'node'), path.join(folder, 'node_modules', '@types', 'node'));
    fs.symlinkSync(path.join(repository, 'node_modules', 'undici-types'), path.join(folder, 'node_modules', 'undici-types'));
    // module nodenext would make every file CommonJS, and each import error TS1295 under verbatimModuleSyntax.
    expect(runTs(folder, ['main.ts'])).toMatchObject({ code: 0, stdout: 'function undefined 4\n', stderr: '' });
    expect(runTs(folder, ['check'])).toMatchObject({ code: 0, output: '' });
  });

  it('checks a standard project, whose tsconfig.json does not name the plugin, as tsc does', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', lib: ['esnext'], strict: true, verbatimModuleSyntax: true, types: [] } }),
      'main.ts': 'import { twice } from "./twice.ts";\nconst answer: string | null = prompt("Name?");\nconsole.log(twice(2), answer);\n',
      'twice.ts': 'export function twice(value: number): number {\n  return 2 * value;\n}\n',
    });
    // No prompt() of ts (TS2304), and module nodenext makes every file CommonJS, whose imports are TS1295.
    for (const args of [['check', 'main.ts'], ['check']]) {
      const result = runTs(folder, args);
      expect(result.code).not.toBe(0);
      expect(result.output).toContain("error TS2304: Cannot find name 'prompt'.");
      expect(result.output).toContain('error TS1295');
    }
  });

  it('runs the CommonJS that tsc writes for module commonjs', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'commonjs', strict: true, types: [] } }),
      'main.ts': 'declare const module: object;\nexport const kind = typeof module;\nconsole.log(kind);\n',
    });
    expect(runTs(folder, ['main.ts'])).toMatchObject({ code: 0, stdout: 'object\n', stderr: '' });
  });

  it('keeps the typeRoots of the project', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, typeRoots: ['./types'] } }),
      'types/shout/index.d.ts': 'declare function shout(text: string): string;\n',
      'main.ts': 'const text: string = shout("x");\n',
    });
    expect(runTs(folder, ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
  });
});

describe('ts with a tsconfig.json and a package.json', () => {
  it('finds a package that "types" names, such as vite/client of a Vite project', () => {
    const folder = tree({
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, module: 'esnext', moduleResolution: 'bundler', types: ['tool/client'] } }),
      'node_modules/tool/package.json': JSON.stringify({ name: 'tool', exports: { './client': { types: './client.d.ts' } } }),
      'node_modules/tool/client.d.ts': 'declare const toolVersion: string;\n',
      'node_modules/@types/x/index.d.ts': '',
      'main.ts': 'const version: string = toolVersion;\n',
    });
    expect(runTs(folder, ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
  });
});

describe('prompt(), alert() and confirm() in a project of ts with a tsconfig.json', () => {
  const PROGRAM = 'const answer: string | null = prompt("Name?");\nif (confirm("Greet?")) alert(`Hello ${answer}`);\n';

  it('are known without a file of the project, to ts check with and without a file and to a run', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', lib: ['esnext'], types: [], strict: true, plugins: TS_PROJECT } }),
      'main.ts': PROGRAM,
    });
    expect(runTs(folder, ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
    expect(runTs(folder, ['check'])).toMatchObject({ code: 0, output: '' });
    const run = runTs(folder, ['main.ts'], 'Mia\ny\n\n');
    expect(run).toMatchObject({ code: 0, stderr: '' });
    expect(run.stdout).toContain('Hello Mia');
    // The run of ts check without a file leaves no temporary tsconfig.json behind.
    expect(fs.readdirSync(folder).sort()).toEqual(['main.ts', 'tsconfig.json']);
  });

  it('stay known when the project declares them itself, and come from lib dom in a project for the browser', () => {
    const own = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { lib: ['esnext'], types: [], strict: true } }),
      'globals.d.ts': 'declare function prompt(message?: string, defaultValue?: string): string | null;\ndeclare function alert(message?: string): void;\ndeclare function confirm(message?: string): boolean;\n',
      'main.ts': PROGRAM,
    });
    expect(runTs(own, ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
    expect(runTs(own, ['check'])).toMatchObject({ code: 0, output: '' });
    const browser = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { lib: ['esnext', 'dom'], types: [], strict: true, plugins: TS_PROJECT } }),
      'main.ts': PROGRAM,
    });
    expect(runTs(browser, ['check', 'main.ts'])).toMatchObject({ code: 0, output: '' });
    expect(runTs(browser, ['check'])).toMatchObject({ code: 0, output: '' });
  });

  it('are unknown in a standard project, as in tsc', () => {
    const folder = tree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', lib: ['esnext'], types: [], strict: true } }),
      'main.ts': PROGRAM,
    });
    expect(runTs(folder, ['check', 'main.ts']).output).toContain("error TS2304: Cannot find name 'prompt'.");
    expect(runTs(folder, ['check']).output).toContain("error TS2304: Cannot find name 'prompt'.");
  });
});

describe('ts init', () => {
  it('writes the tsconfig.json of tsc --init for Node.js and refuses to replace it', () => {
    const folder = tree({});
    const first = runTs(folder, ['init']);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('Created a new tsconfig.json');
    // Nobody can answer the question, so ts names the command.
    expect(first.stdout).toContain('The types of Node.js (@types/node) are not installed. Run npm install --save-dev @types/node');
    const text = fs.readFileSync(path.join(folder, 'tsconfig.json'), 'utf8');
    expect(text).toContain('"lib": ["esnext"],');
    expect(text).toContain('"types": ["node"],');
    expect(text).not.toContain('noUncheckedIndexedAccess');
    // The entry marks the project of ts for ts and the editor.
    expect(text).toContain('"plugins": [{ "name": "nimblescape-typescript-plugin" }],');
    // ts and the editor add the types of prompt(), alert() and confirm(), and every file is an ES module.
    expect(fs.readdirSync(folder)).toEqual(['tsconfig.json']);
    const second = runTs(folder, ['init']);
    expect(second.code).toBe(1);
    expect(second.stderr).toContain('error TS5054');
  });

  it('gives a project in which prompt(), console and the modules of Node.js work', () => {
    const folder = tree({
      'main.ts': 'import { readFileSync } from "node:fs";\nconst name = prompt("Name?") ?? "";\nconsole.log(`Hello ${name}`, typeof readFileSync);\n',
    });
    expect(runTs(folder, ['init']).code).toBe(0);
    // What npm install --save-dev @types/node gives the project.
    fs.mkdirSync(path.join(folder, 'node_modules', '@types'), { recursive: true });
    fs.symlinkSync(path.join(repository, 'node_modules', '@types', 'node'), path.join(folder, 'node_modules', '@types', 'node'));
    fs.symlinkSync(path.join(repository, 'node_modules', 'undici-types'), path.join(folder, 'node_modules', 'undici-types'));
    expect(runTs(folder, ['main.ts'], 'Mia\n')).toMatchObject({ code: 0, stdout: 'Name? Mia\nHello Mia function\n' });
    expect(runTs(folder, ['check'])).toMatchObject({ code: 0, output: '' });
  });

  it('leaves an existing package.json as it is', () => {
    const folder = tree({ 'package.json': '{"name":"mine"}\n' });
    const result = runTs(folder, ['init']);
    expect(result.stdout).not.toContain('package.json');
    expect(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).toBe('{"name":"mine"}\n');
  });

  it('has no option --browser: code for the browser belongs in a Vite project', () => {
    const folder = tree({});
    const result = runTs(folder, ['init', '--browser']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Unknown option --browser. See ts --help.');
    expect(fs.readdirSync(folder)).toEqual([]);
  });
});

describe('ts install', () => {
  /** A fake npm on the PATH that writes its folder and its arguments into npm.log of its own folder. */
  function fakeNpm(): { environment: NodeJS.ProcessEnv; calls: () => string[] } {
    const bin = tree({ npm: '#!/bin/sh\necho "$(pwd -P) $*" >> "$(dirname "$0")/npm.log"\n' });
    fs.chmodSync(path.join(bin, 'npm'), 0o755);
    const log = path.join(bin, 'npm.log');
    return {
      environment: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []),
    };
  }

  it('runs npm ci in the folder of the nearest package.json with a lock file, and npm install without one', () => {
    const npm = fakeNpm();
    const folder = tree({ 'package.json': JSON.stringify({ devDependencies: { shout: '1.0.0' } }), 'package-lock.json': '{}', 'src/main.ts': '' });
    const result = runTs(path.join(folder, 'src'), ['i'], '', npm.environment);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('> npm ci (in ..)\n');
    fs.rmSync(path.join(folder, 'package-lock.json'));
    expect(runTs(folder, ['install'], '', npm.environment).stdout).toContain('> npm install\n');
    expect(npm.calls()).toEqual([`${folder} ci`, `${folder} install`]);
  });

  it('installs TypeScript globally without a package.json, when the package.json lists no packages, and with --global or -g', () => {
    const npm = fakeNpm();
    const project = { 'package.json': JSON.stringify({ devDependencies: { shout: '1.0.0' } }) };
    const cases: [Record<string, string>, string[]][] = [
      [{}, ['install']],
      [{ 'package.json': JSON.stringify({ type: 'module' }) }, ['install']],
      [project, ['install', '--global']],
      [project, ['i', '-g']],
    ];
    for (const [files, args] of cases) {
      const folder = tree(files);
      expect(runTs(folder, args, '', npm.environment).code).toBe(0);
      expect(npm.calls().at(-1)).toMatch(new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} install --global typescript@\\d+\\.\\d+\\.\\d+$`));
    }
  });
});

describe('ts completion', () => {
  it('prints scripts that the shells can read', () => {
    for (const shell of ['bash', 'zsh'] as const) {
      const script = runTs(os.tmpdir(), ['completion', shell]).stdout;
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
