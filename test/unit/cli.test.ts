// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The parts of the command ts that need no TypeScript and no Node.js child process: the command line, the help, the
// Tab completion scripts, the changes to the tsconfig.json of tsc --init, the versions and the list of the install
// question and its requests to the network, the search of the global TypeScript, the JSONC reader, the temporary
// tsconfig.json and the cleanup of the folders of runs. test/cli/ runs the built command.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArguments } from '../../src/cli/args.ts';
import { keysLine, listKeys, listLines, moveInList, windowTop } from '../../src/cli/ask.ts';
import { outputFile, projectOfFile, temporaryConfig, typeRoots, type Job } from '../../src/cli/compile.ts';
import { completionScript } from '../../src/cli/completion.ts';
import { adapt } from '../../src/cli/init.ts';
import { compareVersions, isOfferedVersion, offeredVersions, versionChoices } from '../../src/cli/install.ts';
import { parseJsonc } from '../../src/cli/jsonc.ts';
import { COMMANDS, helpText, OPTIONS, SHELLS } from '../../src/cli/options.ts';
import { missingPackages } from '../../src/cli/packages.ts';
import { removeStaleRuns, runName } from '../../src/cli/run.ts';
import { findGlobal, findTypeScript } from '../../src/cli/typescript.ts';
import { DEFAULT_COMPILER_OPTIONS, findUp, hasBrowserTypes, isTsProject, rootPackageJson } from '../../src/defaults.ts';

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
    expect(parseArguments(['check', 'main.ts', 'check', '--check', '-x'])).toMatchObject({ check: true, file: 'main.ts', args: ['check', '--check', '-x'] });
    expect(parseArguments(['main.ts', 'install', '-g'])).toMatchObject({ install: false, file: 'main.ts', args: ['install', '-g'] });
    expect(parseArguments([])).toMatchObject({ check: false, args: [] });
    expect((parseArguments([]) as { file?: string }).file).toBeUndefined();
    expect(parseArguments(['--', '-odd.ts', 'a'])).toMatchObject({ file: '-odd.ts', args: ['a'] });
  });

  it('reads a command word only in the first place, so that ts ./check runs a file with the name of a command', () => {
    expect(parseArguments(['check'])).toMatchObject({ check: true });
    expect((parseArguments(['check']) as { file?: string }).file).toBeUndefined();
    expect(parseArguments(['./check'])).toMatchObject({ check: false, file: './check' });
    expect(parseArguments(['--', 'init'])).toMatchObject({ init: false, file: 'init' });
    expect(parseArguments(['-v', 'check'])).toMatchObject({ version: true, check: false, file: 'check' });
  });

  it('reads init, and refuses --browser, because code for the browser belongs in a Vite project', () => {
    expect(parseArguments(['init'])).toMatchObject({ init: true });
    expect(parseArguments(['init', '--browser'])).toBe('Unknown option --browser. See ts --help.');
    expect(parseArguments(['init', 'main.ts'])).toBe('ts init takes no file. See ts --help.');
  });

  it('reads install and its short form i, with and without --global or -g', () => {
    for (const word of ['install', 'i']) {
      expect(parseArguments([word])).toMatchObject({ install: true, global: false });
      expect(parseArguments([word, '--global'])).toMatchObject({ install: true, global: true });
      expect(parseArguments([word, '-g'])).toMatchObject({ install: true, global: true });
    }
    expect(parseArguments(['--global'])).toBe('--global works only with ts install. See ts --help.');
    expect(parseArguments(['check', '-g'])).toBe('-g works only with ts install. See ts --help.');
    expect(parseArguments(['install', 'typescript'])).toBe('ts install takes no file. See ts --help.');
  });

  it('reads completion with its shell and refuses an unknown shell or option', () => {
    expect(parseArguments(['completion', 'zsh'])).toMatchObject({ completion: 'zsh' });
    expect(parseArguments(['completion', 'tcsh'])).toBe('ts completion needs one of: bash, zsh, fish.');
    expect(parseArguments(['completion'])).toBe('ts completion needs one of: bash, zsh, fish.');
    expect(parseArguments(['--bogus'])).toBe('Unknown option --bogus. See ts --help.');
  });

  it('refuses the options of ts 0.2.0 to 0.2.2, which the command words replace', () => {
    for (const old of ['--check', '--init', '--completion', '--install-typescript']) expect(parseArguments([old])).toBe(`Unknown option ${old}. See ts --help.`);
    expect(parseArguments(['init', '--check'])).toBe('Unknown option --check. See ts --help.');
  });

  it('names every command and every option in the help and in each completion script', () => {
    const help = helpText('1.2.3');
    expect(help).toContain('ts 1.2.3');
    for (const command of COMMANDS) {
      expect(help).toContain(`ts ${command.name}`);
      for (const alias of command.aliases ?? []) expect(help).toContain(`ts ${alias}`);
      for (const shell of SHELLS) expect(completionScript(shell)).toContain(shell === 'fish' ? `-a ${command.name} ` : command.name);
    }
    for (const option of [...OPTIONS, ...COMMANDS.flatMap((command) => command.options ?? [])]) {
      expect(help).toContain(option.name);
      if (option.short) expect(help).toContain(option.short);
      for (const shell of SHELLS) {
        expect(completionScript(shell)).toContain(shell === 'fish' ? `-l ${option.name.slice(2)}` : option.name);
        if (option.short) expect(completionScript(shell)).toContain(shell === 'fish' ? `-s ${option.short.slice(1)}` : option.short);
      }
    }
  });

  it('writes descriptions without the characters that zsh reads as syntax', () => {
    for (const entry of [...OPTIONS, ...COMMANDS, ...COMMANDS.flatMap((command) => command.options ?? [])]) expect(entry.description).not.toMatch(/[[\]:']/);
  });
});

describe('ts init', () => {
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

  it('turns the lines for Node.js into settings, marks the project of ts and drops four settings', () => {
    const text = adapt(tscInit);
    expect(text).toContain('    "lib": ["esnext"],\n    "types": ["node"],\n');
    expect(text).toContain('    "rewriteRelativeImportExtensions": true,\n');
    expect(text).not.toMatch(/"types": \[\]|For nodejs|noUncheckedIndexedAccess|"declaration"|declarationMap|"jsx"/);
    expect(text).toContain('"exactOptionalPropertyTypes": true');
    expect(text).toContain('"verbatimModuleSyntax": true');
    const settings = parseJsonc(text)?.compilerOptions as Record<string, unknown> | undefined;
    expect(settings).toMatchObject({ lib: ['esnext'], types: ['node'], module: 'nodenext', rewriteRelativeImportExtensions: true });
    expect(settings?.plugins).toEqual([{ name: 'nimblescape-typescript-plugin' }]);
    expect(isTsProject(settings?.plugins)).toBe(true);
  });
});

describe('the install question', () => {
  it('offers TypeScript 6 and newer, without nightly builds, oldest first', () => {
    const all = ['5.9.3', '6.0.0-dev.20251201', '7.0.2', '6.0.3', '6.0.1-rc', '6.0.0-beta', '7.1.0-insiders.1', '7.1.0-beta', '6.0.2'];
    expect(offeredVersions(all)).toEqual(['6.0.0-beta', '6.0.1-rc', '6.0.2', '6.0.3', '7.0.2', '7.1.0-beta']);
    expect(compareVersions('7.0.0-rc', '7.0.0')).toBeLessThan(0);
  });

  it('installs only a version: no tag, range or address of a package from the network', () => {
    expect(isOfferedVersion('6.0.3')).toBe(true);
    expect(isOfferedVersion('7.1.0-rc.1')).toBe(true);
    for (const value of ['latest', '^6.0.0', '6.0.3 || 7', 'https://example.com/typescript.tgz', 'github:someone/typescript', '5.9.3', '', 6, undefined]) {
      expect(isOfferedVersion(value)).toBe(false);
    }
  });

  it('lists the versions newest first, with the default selected and named as recommended', () => {
    const fallback = { version: '6.0.3', reason: 'the TypeScript of VS Code 1.143.1' };
    expect(versionChoices(['6.0.2', '6.0.3', '7.0.2', '7.1.0-beta'], fallback)).toEqual({
      versions: ['7.1.0-beta', '7.0.2', '6.0.3', '6.0.2'],
      labels: ['7.1.0-beta', '7.0.2', '6.0.3 (recommended: the TypeScript of VS Code 1.143.1)', '6.0.2'],
      initial: 2,
    });
    // Offline, the list of npm is empty, and the default is the only entry.
    expect(versionChoices([], fallback).versions).toEqual(['6.0.3']);
  });

  it('reads the arrow keys, Enter and Esc, also several in one read, and ignores other keys', () => {
    expect(listKeys('\x1b[A')).toEqual(['up']);
    expect(listKeys('\x1bOB')).toEqual(['down']);
    expect(listKeys('\x1b[B\x1b[B\r')).toEqual(['down', 'down', 'choose']);
    expect(listKeys('\x1b')).toEqual(['cancel']);
    expect(listKeys('\x03')).toEqual(['cancel']);
    expect(listKeys('\x04')).toEqual(['cancel']);
    // Left, right, Home, Ctrl+Up and letters do nothing; they are not Esc.
    expect(listKeys('\x1b[C\x1b[D\x1b[H\x1b[1;5Ax6')).toEqual([]);
  });

  it('moves the selection, stops at the ends and scrolls the window with it', () => {
    expect(moveInList({ selected: 0, top: 0 }, 'up', 5, 5)).toEqual({ selected: 0, top: 0 });
    expect(moveInList({ selected: 4, top: 0 }, 'down', 5, 5)).toEqual({ selected: 4, top: 0 });
    expect(moveInList({ selected: 2, top: 0 }, 'down', 12, 3)).toEqual({ selected: 3, top: 1 });
    expect(moveInList({ selected: 1, top: 1 }, 'up', 12, 3)).toEqual({ selected: 0, top: 0 });
    expect(windowTop(6, 20, 10)).toBe(1);
    expect(windowTop(19, 20, 10)).toBe(10);
    expect(windowTop(2, 4, 4)).toBe(0);
  });

  it('marks and colors the selected entry, cuts the lines to the width of the terminal and names the position in a long list', () => {
    const labels = ['7.1.0-beta', '7.0.2', '6.0.3 (recommended: the TypeScript of VS Code 1.143.1)'];
    expect(listLines(labels, { selected: 1, top: 0 }, 3, 20)).toEqual(['  7.1.0-beta', '❯ 7.0.2', '  6.0.3 (recommended']);
    expect(listLines(labels, { selected: 2, top: 1 }, 2, 80)).toEqual(['  7.0.2', '❯ 6.0.3 (recommended: the TypeScript of VS Code 1.143.1)']);
    // In color, the selected line is cyan; the color codes do not count for the width.
    expect(listLines(labels, { selected: 1, top: 0 }, 2, 6, true)).toEqual(['  7.1.', '\x1b[36m❯ 7.0.\x1b[39m']);
    expect(keysLine({ selected: 1, top: 0 }, 3, 3)).toBe('  ↑ ↓ select, Enter confirms, Esc cancels');
    expect(keysLine({ selected: 7, top: 2 }, 15, 10)).toBe('  ↑ ↓ select, Enter confirms, Esc cancels (8 of 15)');
  });
});

describe('JSONC', () => {
  it('reads comments and trailing commas, and keeps strings with slashes', () => {
    expect(parseJsonc('{\n // a comment\n "a": "http://x", /* b */ "b": [1, 2,],\n}')).toEqual({ a: 'http://x', b: [1, 2] });
  });

  it('removes a comma before a closing bracket only outside a string, also after a comment', () => {
    expect(parseJsonc('{ "a": "x, }", "b": ["y,]" /* c */, ], "c": "\\\\", }')).toEqual({ a: 'x, }', b: ['y,]'], c: '\\' });
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

  it('leaves the type roots to tsc when the run folder lies inside the project', () => {
    const root = tree({ 'package.json': '{}', 'tsconfig.json': '{}', 'main.ts': '', 'node_modules/@types/x/index.d.ts': '' });
    const project = projectOfFile(path.join(root, 'main.ts'));
    const folder = path.join(root, 'node_modules', '.cache', 'ts', 'run');
    const job: Job = { project, typescript: { folder: '', version: '6.0.3', major: 6, source: 'global' }, folder, checkOnly: true };
    // With typeRoots, tsc would no longer find a package of "types" such as vite/client in node_modules.
    expect(temporaryConfig(job, undefined)).toMatchObject({ compilerOptions: { noEmit: true, rewriteRelativeImportExtensions: true } });
    expect((temporaryConfig(job, undefined) as { compilerOptions: Record<string, unknown> }).compilerOptions).not.toHaveProperty('typeRoots');
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

describe('the global TypeScript', () => {
  it('takes TypeScript 6 or newer from any global folder, and an older one only when no folder has a newer one', () => {
    const typescript = (version: string) => JSON.stringify({ name: 'typescript', version });
    // An old TypeScript next to Node.js, and the new one in the folder of a prefix in ~/.npmrc.
    const nextToNode = tree({ 'typescript/package.json': typescript('5.9.3') });
    const prefix = tree({ 'typescript/package.json': typescript('6.0.3') });
    const empty = tree({});
    expect(findGlobal([empty, nextToNode], () => prefix)).toMatchObject({ version: '6.0.3', source: 'global' });
    expect(findGlobal([nextToNode], () => empty)).toMatchObject({ version: '5.9.3' });
    expect(findGlobal([empty], () => undefined)).toBeUndefined();
    // The global folder of npm takes some 100 ms: ts asks for it only when the other folders have no TypeScript 6.
    const npmFolder = vi.fn(() => empty);
    expect(findGlobal([prefix], npmFolder)).toMatchObject({ version: '6.0.3' });
    expect(npmFolder).not.toHaveBeenCalled();
  });
});

describe('the defaults', () => {
  it('find a file upwards and name the package.json at the root of the file system', () => {
    const root = tree({ 'a/x.json': '', 'a/b/c/.keep': '' });
    expect(findUp(path.join(root, 'a/b/c'), 'x.json', fs.existsSync)).toBe(path.join(root, 'a'));
    expect(findUp(path.join(root, 'a/b/c'), 'none.json', fs.existsSync)).toBeUndefined();
    expect(rootPackageJson('/workspaces/course/main.ts')).toBe('/package.json');
  });

  it('know a project of ts by the entry of the editor plugin in compilerOptions.plugins', () => {
    expect(isTsProject([{ name: 'other-plugin' }, { name: 'nimblescape-typescript-plugin', entryFiles: ['main.ts'] }])).toBe(true);
    expect(isTsProject(undefined)).toBe(false);
    expect(isTsProject([])).toBe(false);
    expect(isTsProject([{ name: 'other-plugin' }])).toBe(false);
    expect(isTsProject('nimblescape-typescript-plugin')).toBe(false);
  });

  it('know when a program has the types of the browser, which declare prompt() themselves', () => {
    // Without "lib", tsc takes the full library of the target, which includes dom.
    expect(hasBrowserTypes(undefined)).toBe(true);
    expect(hasBrowserTypes(['esnext', 'DOM'])).toBe(true);
    expect(hasBrowserTypes(['lib.esnext.d.ts', 'lib.dom.iterable.d.ts'])).toBe(true);
    expect(hasBrowserTypes(['esnext'])).toBe(false);
    expect(hasBrowserTypes(['lib.es2023.d.ts', 'lib.decorators.d.ts'])).toBe(false);
  });
});

describe('the cleanup of the folders of runs', () => {
  it('checks the process only on its own machine, and deletes a run of another machine after one day', () => {
    const cache = tree({});
    // The name of a run of this machine, with another process ID.
    const ofThisMachine = (pid: number) => runName().replace(/^\d+/, String(pid));
    const twoDaysAgo = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    const runs = {
      ended: ofThisMachine(999999),
      running: ofThisMachine(process.ppid),
      otherMachine: '999999-0123abcd-4567cdef',
      otherMachineOld: '999999-0123abcd-89abcdef',
      ts030: '999999-0123abcd',
      ts030Old: '999998-0123abcd',
    };
    for (const name of Object.values(runs)) fs.mkdirSync(path.join(cache, name));
    for (const name of [runs.otherMachineOld, runs.ts030Old]) fs.utimesSync(path.join(cache, name), twoDaysAgo, twoDaysAgo);
    removeStaleRuns(cache);
    expect(fs.readdirSync(cache).sort()).toEqual([runs.running, runs.otherMachine, runs.ts030].sort());
  });
});

describe('the network for the install question', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../../src/cli/ask.ts');
    vi.resetModules();
  });

  it('is not asked without a terminal, when ts only prints the install command', async () => {
    vi.resetModules();
    vi.doMock('../../src/cli/ask.ts', async (original) => ({ ...(await original<object>()), canAsk: () => false }));
    vi.stubGlobal('BUNDLED_TYPESCRIPT', '6.0.3');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line));
    const { offerInstall } = await import('../../src/cli/install.ts');
    expect(await offerInstall()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).toContain('Install it with: npm install --global typescript@6.0.3');
  });

  it('gets the versions of npm at the same time as the TypeScript of VS Code', async () => {
    vi.resetModules();
    vi.stubGlobal('BUNDLED_TYPESCRIPT', '6.0.3');
    const urls: string[] = [];
    let answer = () => {};
    const network = new Promise<void>((resolve) => (answer = resolve));
    // A slow network: no request gets an answer before both are sent.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        await network;
        return { ok: false, status: 503 };
      }),
    );
    const { listVersions } = await import('../../src/cli/install.ts');
    const list = listVersions();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(urls.sort()).toEqual(['https://registry.npmjs.org/typescript', 'https://update.code.visualstudio.com/api/releases/stable']);
    answer();
    expect(await list).toMatchObject({ fallback: { version: '6.0.3' }, offered: [] });
  });
});
