// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The repair path (src/installHint.ts and the activation in src/extension.ts) with a fake editor API over folders in a
// temporary folder: the hint of a folder whose TypeScript server is missing, the terminal of its button, the wait for
// the file with the file watcher and with the timer, the hint to reload the window, Restricted Mode, and the folders
// that the workspace adds and removes. No installed editor is touched.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TSSERVER } from '../../src/installCheck.ts';

interface FakeUri {
  scheme: string;
  fsPath: string;
}

interface FakeFolder {
  uri: FakeUri;
  name: string;
  index: number;
}

interface FakeWatcher {
  base: string;
  pattern: string;
  listeners: { create: (() => void)[]; change: (() => void)[]; delete: (() => void)[] };
  disposed: boolean;
}

interface FakeMessage {
  kind: 'warning' | 'information';
  text: string;
  items: string[];
  answer(choice?: string): void;
}

interface FakeTerminal {
  name: string;
  cwd: FakeUri;
  sent: string[];
  shown: number;
}

const uri = (fsPath: string): FakeUri => ({ scheme: 'file', fsPath });
const disposable = { dispose() {} };

/** A fake of the parts of the editor API that the repair path uses, with a record of what the extension did. */
function fakeEditor(roots: string[]) {
  const record = {
    trusted: true,
    folders: roots.map((root, index): FakeFolder => ({ uri: uri(root), name: path.basename(root), index })),
    watchers: [] as FakeWatcher[],
    messages: [] as FakeMessage[],
    terminals: [] as FakeTerminal[],
    commands: [] as string[],
    folderListeners: [] as (() => void)[],
    trustListeners: [] as (() => void)[],
    closeListeners: [] as ((terminal: FakeTerminal) => void)[],
  };
  const message =
    (kind: FakeMessage['kind']) =>
    (text: string, ...items: string[]): Promise<string | undefined> =>
      new Promise((answer) => record.messages.push({ kind, text, items, answer }));
  const api = {
    Uri: { joinPath: (base: FakeUri, ...parts: string[]) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class {
      base: string;
      constructor(
        base: FakeUri | FakeFolder,
        readonly pattern: string,
      ) {
        this.base = 'uri' in base ? base.uri.fsPath : base.fsPath;
      }
    },
    workspace: {
      get isTrusted() {
        return record.trusted;
      },
      get workspaceFolders() {
        return record.folders;
      },
      onDidChangeWorkspaceFolders: (listener: () => void) => (record.folderListeners.push(listener), disposable),
      onDidGrantWorkspaceTrust: (listener: () => void) => (record.trustListeners.push(listener), disposable),
      createFileSystemWatcher: (pattern: { base: string; pattern: string }) => {
        const watcher: FakeWatcher = { base: pattern.base, pattern: pattern.pattern, listeners: { create: [], change: [], delete: [] }, disposed: false };
        record.watchers.push(watcher);
        return {
          onDidCreate: (listener: () => void) => (watcher.listeners.create.push(listener), disposable),
          onDidChange: (listener: () => void) => (watcher.listeners.change.push(listener), disposable),
          onDidDelete: (listener: () => void) => (watcher.listeners.delete.push(listener), disposable),
          dispose: () => {
            watcher.disposed = true;
          },
        };
      },
    },
    window: {
      onDidCloseTerminal: (listener: (terminal: FakeTerminal) => void) => (record.closeListeners.push(listener), disposable),
      showWarningMessage: message('warning'),
      showInformationMessage: message('information'),
      createTerminal: (options: { name: string; cwd: FakeUri }) => {
        const terminal: FakeTerminal = { name: options.name, cwd: options.cwd, sent: [], shown: 0 };
        record.terminals.push(terminal);
        return Object.assign(terminal, {
          sendText: (text: string) => terminal.sent.push(text),
          show: () => terminal.shown++,
        });
      },
    },
    commands: {
      executeCommand: async (command: string) => {
        record.commands.push(command);
      },
    },
    // The parts of the API that the other work of the activation uses: the terminals and the debug type ts.
    env: { appRoot: path.join(os.tmpdir(), 'no-vscode') },
    debug: { registerDebugConfigurationProvider: () => disposable },
    DebugConfigurationProviderTriggerKind: { Initial: 1, Dynamic: 2 },
  };
  Object.assign(api.workspace, { getConfiguration: () => ({ inspect: () => undefined }) });
  return { api, record };
}

const roots: string[] = [];

/** A new folder with the files of `files`. */
function folder(name: string, files: Record<string, string>): string {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-')), name);
  roots.push(path.dirname(root));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

const COURSE = { 'package.json': JSON.stringify({ devDependencies: { typescript: '6.0.3' } }), 'package-lock.json': '{}' };

function install(root: string): void {
  fs.mkdirSync(path.dirname(path.join(root, TSSERVER)), { recursive: true });
  fs.writeFileSync(path.join(root, TSSERVER), '');
}

/** Activates the extension with the fake editor API. */
async function activate(fake: ReturnType<typeof fakeEditor>) {
  vi.resetModules();
  vi.doMock('vscode', () => fake.api);
  const extension = await import('../../src/extension.ts');
  const subscriptions: { dispose(): void }[] = [];
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-storage-'));
  roots.push(storage);
  const environmentVariableCollection = { description: '', clear() {}, append() {}, replace() {} };
  const context = { subscriptions, extensionPath: path.resolve('.'), globalStorageUri: uri(storage), environmentVariableCollection };
  const api = extension.activate(context as never);
  return { api, dispose: () => subscriptions.forEach((s) => s.dispose()) };
}

/** Lets the promises of the messages run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('vscode');
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('a folder whose TypeScript server is missing', () => {
  it('gets a hint with the button "Run npm ci", which runs npm ci in a terminal in the folder', async () => {
    const root = folder('course', COURSE);
    const fake = fakeEditor([root]);
    const { api, dispose } = await activate(fake);
    expect(api.installStates()).toEqual({ [root]: 'missing' });
    expect(fake.record.messages).toHaveLength(1);
    const [hint] = fake.record.messages;
    expect(hint.kind).toBe('warning');
    expect(hint.text).toContain('course');
    expect(hint.text).toContain(TSSERVER);
    expect(hint.items).toEqual(['Run npm ci']);
    hint.answer('Run npm ci');
    await settle();
    expect(fake.record.terminals).toHaveLength(1);
    expect(fake.record.terminals[0]).toMatchObject({ name: 'npm ci (course)', cwd: uri(root), sent: ['npm ci'], shown: 1 });
    dispose();
  });

  it('runs npm install when the folder has no package-lock.json', async () => {
    const root = folder('course', { 'package.json': COURSE['package.json'] });
    const fake = fakeEditor([root]);
    const { dispose } = await activate(fake);
    expect(fake.record.messages[0].items).toEqual(['Run npm install']);
    fake.record.messages[0].answer('Run npm install');
    await settle();
    expect(fake.record.terminals[0].sent).toEqual(['npm install']);
    dispose();
  });

  it('offers to reload the window when the file appears, found by the timer', async () => {
    const root = folder('course', COURSE);
    const fake = fakeEditor([root]);
    const { api, dispose } = await activate(fake);
    vi.advanceTimersByTime(10_000);
    expect(api.installStates()).toEqual({ [root]: 'missing' });
    install(root);
    vi.advanceTimersByTime(2000);
    expect(api.installStates()).toEqual({ [root]: 'reload' });
    const reload = fake.record.messages[1];
    expect(reload.kind).toBe('information');
    expect(reload.items).toEqual(['Reload window']);
    reload.answer('Reload window');
    await settle();
    expect(fake.record.commands).toEqual(['workbench.action.reloadWindow']);
    // The wait ends: the watcher of the file is disposed, and the timer shows no second hint.
    expect(fake.record.watchers.find((w) => w.pattern === 'tsserver.js')?.disposed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(fake.record.messages).toHaveLength(2);
    dispose();
  });

  it('offers to reload the window when the file watcher reports the file', async () => {
    const root = folder('course', COURSE);
    const fake = fakeEditor([root]);
    const { api, dispose } = await activate(fake);
    const watcher = fake.record.watchers.find((w) => w.pattern === 'tsserver.js')!;
    expect(watcher.base).toBe(path.join(root, 'node_modules', 'typescript', 'lib'));
    install(root);
    for (const listener of watcher.listeners.create) listener();
    expect(api.installStates()).toEqual({ [root]: 'reload' });
    dispose();
  });

  it('shows the terminal of the running install again on a second click, and opens a new one after it closed', async () => {
    const root = folder('course', COURSE);
    const fake = fakeEditor([root]);
    const { dispose } = await activate(fake);
    // A second hint comes only after the state changed: package.json drops typescript and lists it again.
    fake.record.messages[0].answer('Run npm ci');
    await settle();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: {} }));
    for (const listener of fake.record.watchers.find((w) => w.pattern === 'package.json')!.listeners.change) listener();
    fs.writeFileSync(path.join(root, 'package.json'), COURSE['package.json']);
    for (const listener of fake.record.watchers.find((w) => w.pattern === 'package.json')!.listeners.change) listener();
    expect(fake.record.messages).toHaveLength(2);
    fake.record.messages[1].answer('Run npm ci');
    await settle();
    expect(fake.record.terminals).toHaveLength(1);
    expect(fake.record.terminals[0].shown).toBe(2);
    for (const listener of fake.record.closeListeners) listener(fake.record.terminals[0]);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: {} }));
    for (const listener of fake.record.watchers.find((w) => w.pattern === 'package.json')!.listeners.change) listener();
    fs.writeFileSync(path.join(root, 'package.json'), COURSE['package.json']);
    for (const listener of fake.record.watchers.find((w) => w.pattern === 'package.json')!.listeners.change) listener();
    fake.record.messages[2].answer('Run npm ci');
    await settle();
    expect(fake.record.terminals).toHaveLength(2);
    dispose();
  });
});

describe('the folders of the workspace', () => {
  it('gives no hint to a folder whose TypeScript is installed or whose package.json lists no typescript', async () => {
    const installed = folder('installed', COURSE);
    install(installed);
    const other = folder('other', { 'package.json': JSON.stringify({ dependencies: { 'es-toolkit': '1.0.0' } }) });
    const fake = fakeEditor([installed, other]);
    const { api, dispose } = await activate(fake);
    expect(api.installStates()).toEqual({ [installed]: 'installed', [other]: 'none' });
    expect(fake.record.messages).toEqual([]);
    dispose();
  });

  it('gives no hint in Restricted Mode, and the hint after the user trusts the workspace', async () => {
    const root = folder('course', COURSE);
    const fake = fakeEditor([root]);
    fake.record.trusted = false;
    const { api, dispose } = await activate(fake);
    expect(api.installStates()).toEqual({});
    expect(fake.record.messages).toEqual([]);
    fake.record.trusted = true;
    for (const listener of fake.record.trustListeners) listener();
    expect(api.installStates()).toEqual({ [root]: 'missing' });
    expect(fake.record.messages).toHaveLength(1);
    dispose();
  });

  it('checks a folder that the workspace adds, and forgets a folder that it removes', async () => {
    const first = folder('first', COURSE);
    const second = folder('second', COURSE);
    const fake = fakeEditor([first]);
    const { api, dispose } = await activate(fake);
    fake.record.folders.push({ uri: uri(second), name: 'second', index: 1 });
    for (const listener of fake.record.folderListeners) listener();
    expect(api.installStates()).toEqual({ [first]: 'missing', [second]: 'missing' });
    fake.record.folders.splice(0, 1);
    for (const listener of fake.record.folderListeners) listener();
    expect(api.installStates()).toEqual({ [second]: 'missing' });
    const watchersOfFirst = fake.record.watchers.filter((w) => w.base.startsWith(first));
    expect(watchersOfFirst.length).toBeGreaterThan(0);
    expect(watchersOfFirst.every((w) => w.disposed)).toBe(true);
    dispose();
    expect(fake.record.watchers.every((w) => w.disposed)).toBe(true);
  });
});
