// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The parts of the command ts that need no TypeScript and no Node.js child process: the command line, the help, the
// Tab completion scripts, the changes to the tsconfig.json of tsc --init, the versions of the install question, the
// JSONC reader and the temporary tsconfig.json. test/cli/ runs the built command.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArguments } from '../../src/cli/args.ts';
import { outputFile, projectOfFile, temporaryConfig, typeRoots, type Job } from '../../src/cli/compile.ts';
import { completionScript } from '../../src/cli/completion.ts';
import { adapt } from '../../src/cli/init.ts';
import { compareVersions, offeredVersions } from '../../src/cli/install.ts';
import { parseJsonc } from '../../src/cli/jsonc.ts';
import { helpText, OPTIONS } from '../../src/cli/options.ts';
import { missingPackages } from '../../src/cli/packages.ts';
import { findTypeScript } from '../../src/cli/typescript.ts';
import { DEFAULT_COMPILER_OPTIONS, findUp, rootPackageJson } from '../../src/defaults.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

/** A temporary folder with files, given as paths relative to the folder and their text. */
function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-unit-'));
  folders.push(root);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

describe('the command line', () => {
  it('reads the options before the file and passes every word after it to the program', () => {
    expect(parseArguments(['--check', 'main.ts', '--check', '-x'])).toMatchObject({ check: true, file: 'main.ts', args: ['--check', '-x'] });
    expect(parseArguments([])).toMatchObject({ check: false, args: [] });
    expect((parseArguments([]) as { file?: string }).file).toBeUndefined();
    expect(parseArguments(['--', '-odd.ts', 'a'])).toMatchObject({ file: '-odd.ts', args: ['a'] });
  });

  it('reads --init with --browser, and refuses --browser alone', () => {
    expect(parseArguments(['--init', '--browser'])).toMatchObject({ init: true, browser: true });
    expect(parseArguments(['--browser'])).toBe('--browser works only with --init.');
  });

  it('reads --completion with its shell and refuses an unknown shell or option', () => {
    expect(parseArguments(['--completion', 'zsh'])).toMatchObject({ completion: 'zsh' });
    expect(parseArguments(['--completion', 'tcsh'])).toBe('--completion needs one of: bash, zsh, fish.');
    expect(parseArguments(['--bogus'])).toBe('Unknown option --bogus. See ts --help.');
  });

  it('names every option in the help and in each completion script', () => {
    const help = helpText('1.2.3');
    expect(help).toContain('ts 1.2.3');
    for (const option of OPTIONS) {
      expect(help).toContain(option.name);
      for (const shell of ['bash', 'zsh', 'fish'] as const) {
        expect(completionScript(shell)).toContain(shell === 'fish' ? `-l ${option.name.slice(2)}` : option.name);
      }
    }
  });

  it('writes descriptions without the characters that zsh reads as syntax', () => {
    for (const option of OPTIONS) expect(option.description).not.toMatch(/[[\]:']/);
  });
});

describe('ts --init', () => {
  const tscInit = [
    '{',
    '  "compilerOptions": {',
    '    "module": "nodenext",',
    '    "target": "esnext",',
    '    "types": [],',
    '    // For nodejs:',
    '    // "lib": ["esnext"],',
    '    // "types": ["node"],',
    '    // and npm install -D @types/node',
    '',
    '    "sourceMap": true,',
    '    "declaration": true,',
    '    "declarationMap": true,',
    '    "noUncheckedIndexedAccess": true,',
    '    "exactOptionalPropertyTypes": true,',
    '    "strict": true,',
    '    "jsx": "react-jsx",',
    '    "verbatimModuleSyntax": true,',
    '  }',
    '}',
  ].join('\n');

  it('turns the lines for Node.js into settings and drops four settings', () => {
    const text = adapt(tscInit, false);
    expect(text).toContain('    "lib": ["esnext"],\n    "types": ["node"],');
    expect(text).not.toMatch(/"types": \[\]|For nodejs|noUncheckedIndexedAccess|"declaration"|declarationMap|"jsx"/);
    expect(text).toContain('"exactOptionalPropertyTypes": true');
    expect(text).toContain('"verbatimModuleSyntax": true');
    expect(parseJsonc(text)?.compilerOptions).toMatchObject({ lib: ['esnext'], types: ['node'], module: 'nodenext' });
  });

  it('writes the browser settings with --browser', () => {
    const settings = parseJsonc(adapt(tscInit, true))?.compilerOptions;
    expect(settings).toMatchObject({ lib: ['esnext', 'dom'], types: [] });
  });
});

describe('the install question', () => {
  it('offers TypeScript 6 and newer, without nightly builds, oldest first', () => {
    const all = ['5.9.3', '6.0.0-dev.20251201', '7.0.2', '6.0.3', '6.0.1-rc', '6.0.0-beta', '7.1.0-insiders.1', '7.1.0-beta', '6.0.2'];
    expect(offeredVersions(all)).toEqual(['6.0.0-beta', '6.0.1-rc', '6.0.2', '6.0.3', '7.0.2', '7.1.0-beta']);
    expect(compareVersions('7.0.0-rc', '7.0.0')).toBeLessThan(0);
  });
});

describe('JSONC', () => {
  it('reads comments and trailing commas, and keeps strings with slashes', () => {
    expect(parseJsonc('{\n // a comment\n "a": "http://x", /* b */ "b": [1, 2,],\n}')).toEqual({ a: 'http://x', b: [1, 2] });
  });
});

describe('the project of a file', () => {
  it('finds the nearest tsconfig.json and package.json, and the module system of the output', () => {
    const root = tree({ 'course/package.json': '{"type":"module"}', 'course/a/tsconfig.json': '{}', 'course/a/b/main.ts': '' });
    const project = projectOfFile(path.join(root, 'course/a/b/main.ts'));
    expect(project.config).toBe(path.join(root, 'course/a/tsconfig.json'));
    expect(project.packageRoot).toBe(path.join(root, 'course'));
    expect(project.moduleType).toBe('module');
    expect(projectOfFile(path.join(tree({ 'package.json': '{"type":"commonjs"}', 'main.ts': '' }), 'main.ts')).moduleType).toBe('commonjs');
    // Without "type", Node.js reads the syntax of each compiled file, and so it does for a tsconfig.json without a
    // package.json, where tsc writes CommonJS for module nodenext.
    expect(projectOfFile(path.join(tree({ 'package.json': '{}', 'main.ts': '' }), 'main.ts')).moduleType).toBeUndefined();
    expect(projectOfFile(path.join(tree({ 'tsconfig.json': '{}', 'main.ts': '' }), 'main.ts')).moduleType).toBeUndefined();
    expect(projectOfFile(path.join(tree({ 'main.ts': '' }), 'main.ts')).moduleType).toBe('module');
  });

  it('writes the defaults with the type roots of the project first, when there is no tsconfig.json', () => {
    const root = tree({ 'node_modules/@types/x/index.d.ts': '', 'main.ts': '' });
    const roots = typeRoots(root, { NIMBLESCAPE_TS_TYPES: path.resolve('cli') });
    expect(roots[0]).toBe(path.join(root, 'node_modules', '@types'));
    expect(roots).toEqual(expect.arrayContaining([path.resolve('cli', 'types'), path.resolve('cli', 'node_modules', '@types')]));
    const project = projectOfFile(path.join(root, 'main.ts'));
    const job: Job = { project, typescript: { folder: '', version: '6.0.3', major: 6, source: 'global' }, folder: '/run', checkOnly: false };
    const config = temporaryConfig(job, undefined) as { compilerOptions: Record<string, unknown>; files: string[] };
    expect(config.compilerOptions).toMatchObject({ ...DEFAULT_COMPILER_OPTIONS, noEmit: false, outDir: '/run/out', rootDir: '/', noEmitOnError: true });
    expect(config.files).toEqual([project.file]);
    expect(outputFile(job)).toBe(path.join('/run/out', project.file.slice(1).replace(/\.ts$/, '.js')));
  });

  it('extends the tsconfig.json of the project and checks only the file and its imports', () => {
    const root = tree({ 'tsconfig.json': '{}', 'main.mts': '', 'node_modules/@types/x/index.d.ts': '' });
    const project = projectOfFile(path.join(root, 'main.mts'));
    const job: Job = { project, typescript: { folder: '', version: '7.0.2', major: 7, source: 'global' }, folder: '/run', checkOnly: true };
    // tsc would look for the type packages from the folder of the run, so the type roots name the project's.
    expect(temporaryConfig(job, undefined)).toEqual({
      extends: path.join(root, 'tsconfig.json'),
      compilerOptions: { noEmit: true, typeRoots: [path.join(root, 'node_modules', '@types')], rewriteRelativeImportExtensions: true },
      files: [project.file],
      include: [],
    });
    expect(outputFile(job)).toMatch(/main\.mjs$/);
  });
});

describe('the packages and the TypeScript of a project', () => {
  it('reports the packages of package.json that are not installed', () => {
    const root = tree({
      'package.json': JSON.stringify({ dependencies: { a: '1', b: '1' }, optionalDependencies: { fsevents: '2' } }),
      'node_modules/a/package.json': '{}',
      'sub/main.ts': '',
    });
    expect(missingPackages(path.join(root, 'sub'))).toEqual({ root, missing: ['b'] });
  });

  it('takes the TypeScript that the project pins, before the TypeScript of VS Code', () => {
    const pinned = tree({
      'package.json': JSON.stringify({ devDependencies: { typescript: '6.0.3' } }),
      'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', version: '6.0.3' }),
    });
    const vscode = tree({ 'package.json': JSON.stringify({ name: 'typescript', version: '7.0.2' }) });
    expect(findTypeScript(pinned, { NIMBLESCAPE_TS_TYPESCRIPT: vscode })).toMatchObject({ found: { source: 'project', version: '6.0.3' } });
    expect(findTypeScript(tree({}), { NIMBLESCAPE_TS_TYPESCRIPT: vscode })).toMatchObject({ found: { source: 'vscode', major: 7 } });
    const missing = tree({ 'package.json': JSON.stringify({ devDependencies: { typescript: '6.0.3' } }) });
    expect(findTypeScript(missing, {})).toEqual({ projectMissing: missing });
  });
});

describe('the defaults', () => {
  it('find a file upwards and name the package.json at the root of the file system', () => {
    const root = tree({ 'a/x.json': '', 'a/b/c/.keep': '' });
    expect(findUp(path.join(root, 'a/b/c'), 'x.json', fs.existsSync)).toBe(path.join(root, 'a'));
    expect(findUp(path.join(root, 'a/b/c'), 'none.json', fs.existsSync)).toBeUndefined();
    expect(rootPackageJson('/workspaces/course/main.ts')).toBe('/package.json');
  });
});
