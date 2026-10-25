// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The debug type ts without an editor (src/debugType.ts and the search for a global ts in src/environment.ts): the
// configuration of js-debug that a configuration of type ts becomes, the default of cwd, and the ts that a session
// runs. test/vscode/debug.test.ts runs real sessions.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

beforeEach(() => {
  vi.resetModules();
  vi.doMock('vscode', () => ({}));
});

const workspace = { uri: { fsPath: '/workspaces/course' }, name: 'course', index: 0 };
const ts = { command: '/usr/local/bin/ts', packageFolder: '/usr/local/lib/node_modules/@nimblescape/typescript' };

describe('the configuration of js-debug', () => {
  it('runs the program with ts in the integrated terminal, with the source maps of the output of ts', async () => {
    const { MARKER, nodeConfiguration } = await import('../../src/debugType.ts');
    const config = nodeConfiguration({ type: 'ts', request: 'launch', name: 'Run', program: '${file}' }, workspace as never, ts, { A: '1' });
    expect(config).toMatchObject({
      type: 'node',
      request: 'launch',
      name: 'Run',
      runtimeExecutable: ts.command,
      program: '${file}',
      cwd: '${fileDirname}',
      console: 'integratedTerminal',
      pauseForSourceMap: true,
      [MARKER]: { stopOnEntry: false },
    });
    expect(config.resolveSourceMapLocations).toEqual(expect.arrayContaining(['${workspaceFolder}/**', '**/node_modules/.cache/ts/**']));
    expect(config.skipFiles).toEqual(['<node_internals>/**', '**/node_modules/**', '!**/node_modules/.cache/ts/**', `${ts.packageFolder}/**`]);
    expect(config.env).toMatchObject({ A: '1', NIMBLESCAPE_TS_DEBUG: '1' });
    expect(config.env.NIMBLESCAPE_TS_RUN).toMatch(new RegExp(`^${process.pid}-[0-9a-f]+$`));
    // stopOnEntry of js-debug gets the compiled file later (EntryFileProvider), so it is not passed on here.
    expect('stopOnEntry' in config).toBe(false);
  });

  it('keeps every attribute that the configuration sets itself, and names no workspace folder without one', async () => {
    const { MARKER, nodeConfiguration } = await import('../../src/debugType.ts');
    const config = nodeConfiguration(
      { type: 'ts', request: 'launch', name: 'X', program: '/a/main.ts', console: 'internalConsole', cwd: '/b', env: { A: '2' }, skipFiles: [], stopOnEntry: true },
      undefined,
      ts,
      { A: '1' },
    );
    expect(config).toMatchObject({ console: 'internalConsole', cwd: '/b', skipFiles: [], env: { A: '2' }, [MARKER]: { stopOnEntry: true } });
    expect(config.resolveSourceMapLocations).not.toContain('${workspaceFolder}/**');
  });

  it('runs a program in its own folder by default', async () => {
    const { programFolder } = await import('../../src/debugType.ts');
    expect(programFolder('${file}', workspace as never)).toBe('${fileDirname}');
    expect(programFolder('${workspaceFolder}/10-chapters/main.ts', workspace as never)).toBe('${workspaceFolder}/10-chapters');
    expect(programFolder('/x/y/main.ts', undefined)).toBe('/x/y');
    expect(programFolder('a/main.ts', workspace as never)).toBe(path.join('/workspaces/course', 'a'));
  });
});

describe('the ts of a debug session', () => {
  it('is a global ts of npm on the PATH, and not another command named ts', async () => {
    const { globalTs } = await import('../../src/environment.ts');
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-global-')));
    folders.push(root);
    const script = path.join(root, 'lib', 'node_modules', '@nimblescape', 'typescript', 'dist', 'ts.js');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, '');
    fs.mkdirSync(path.join(root, 'other'));
    fs.writeFileSync(path.join(root, 'other', 'ts'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(root, 'bin'));
    fs.symlinkSync(script, path.join(root, 'bin', 'ts'));
    const PATH = [path.join(root, 'none'), path.join(root, 'other'), path.join(root, 'bin')].join(path.delimiter);
    expect(globalTs({ PATH })).toEqual({ command: path.join(root, 'bin', 'ts'), packageFolder: path.dirname(path.dirname(script)) });
    expect(globalTs({ PATH: path.join(root, 'other') })).toBeUndefined();
  });
});
