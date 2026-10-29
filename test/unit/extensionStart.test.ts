// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The start of the extension without an editor, with a small imitation of the API of VS Code: the settings of the
// plugin wait until VS Code starts the TypeScript extension (src/pluginSettings.ts), and the terminals get the fpath of
// zsh without a wait of the extension host (src/environment.ts).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const folders: string[] = [];
const restore: (() => void)[] = [];
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function temporaryFolder(): string {
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-start-')));
  folders.push(folder);
  return folder;
}

/** Sets an environment variable of this process for one test; undefined deletes it. */
function setVariable(name: string, value: string | undefined): void {
  const before = process.env[name];
  restore.push(() => (before === undefined ? delete process.env[name] : (process.env[name] = before)));
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

type Listener = (document: { languageId: string }) => void;

/** The parts of the API of VS Code that the start uses, and what the tests look at. */
function imitation(openDocuments: string[], active = false) {
  const listeners: Listener[] = [];
  const configurePlugin = vi.fn();
  const extension = {
    isActive: active,
    activate: vi.fn(async () => {
      extension.isActive = true;
      return { getAPI: () => ({ configurePlugin }) };
    }),
  };
  const disposable = { dispose: () => {} };
  const vscode = {
    extensions: { getExtension: () => extension },
    env: { appRoot: '/vscode' },
    workspace: {
      textDocuments: openDocuments.map((languageId) => ({ languageId })),
      workspaceFolders: [{ uri: { fsPath: '/workspaces/course' } }],
      getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
      onDidOpenTextDocument: (listener: Listener) => {
        listeners.push(listener);
        return { dispose: () => listeners.splice(listeners.indexOf(listener), 1) };
      },
      onDidChangeConfiguration: () => disposable,
      onDidChangeWorkspaceFolders: () => disposable,
    },
  };
  const open = (languageId: string) => {
    for (const listener of [...listeners]) listener({ languageId });
  };
  return { vscode, extension, configurePlugin, open, context: { subscriptions: [] as unknown[] } };
}

beforeEach(() => vi.resetModules());

describe('the settings of the plugin', () => {
  it('wait until a document of the TypeScript server opens, and do not start the TypeScript extension before', async () => {
    const start = imitation(['python', 'markdown']);
    vi.doMock('vscode', () => start.vscode);
    const { sendPluginSettings } = await import('../../src/pluginSettings.ts');
    const sent = sendPluginSettings(start.context as never);
    start.open('json');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(start.extension.activate).not.toHaveBeenCalled();
    start.open('typescript');
    await sent;
    expect(start.extension.activate).toHaveBeenCalledOnce();
    expect(start.configurePlugin).toHaveBeenCalledWith('nimblescape-typescript-plugin', {
      assignmentFolders: undefined,
      entryFiles: undefined,
      workspaceFolders: ['/workspaces/course'],
    });
  });

  it('go at once when a JavaScript file is open or the TypeScript extension runs', async () => {
    for (const start of [imitation(['javascript']), imitation([], true)]) {
      vi.resetModules();
      vi.doMock('vscode', () => start.vscode);
      const { sendPluginSettings } = await import('../../src/pluginSettings.ts');
      await sendPluginSettings(start.context as never);
      expect(start.configurePlugin).toHaveBeenCalledOnce();
    }
  });
});

describe('the terminals', () => {
  it('get the fpath of the zsh of the terminals without a wait, and keep the FPATH of the last start until zsh answers', async () => {
    const bin = temporaryFolder();
    // A zsh that answers late, and another zsh on the PATH, which the terminals do not use.
    fs.mkdirSync(path.join(bin, 'terminal'));
    fs.writeFileSync(path.join(bin, 'terminal', 'zsh'), '#!/bin/sh\nsleep 0.3\necho /zsh/functions\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'zsh'), '#!/bin/sh\necho /other/zsh\n', { mode: 0o755 });
    setVariable('PATH', `${bin}${path.delimiter}${process.env.PATH}`);
    setVariable('FPATH', undefined);
    const start = imitation([]);
    vi.doMock('vscode', () => ({ ...start.vscode, env: { appRoot: '/vscode', shell: path.join(bin, 'terminal', 'zsh') } }));
    const { setUpTerminals } = await import('../../src/environment.ts');
    const storage = temporaryFolder();
    const variables = new Map<string, { value: string }>([['FPATH', { value: '/last/start' }]]);
    const collection = {
      get: (name: string) => variables.get(name),
      replace: (name: string, value: string) => variables.set(name, { value }),
      append: (name: string, value: string) => variables.set(name, { value }),
      delete: (name: string) => variables.delete(name),
      clear: () => variables.clear(),
    };
    setUpTerminals({ globalStorageUri: { fsPath: storage }, extensionPath: '/extension', environmentVariableCollection: collection } as never);
    expect(variables.get('FPATH')?.value).toBe('/last/start');
    const zsh = path.join(storage, 'completion', 'zsh');
    await vi.waitFor(() => expect(variables.get('FPATH')?.value).toBe(`/zsh/functions${path.delimiter}${zsh}`), { timeout: 5000 });
  });
});
