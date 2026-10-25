// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference types="mocha" />
// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs, run "loose"): debug sessions of the debug type ts
// with VS Code's JavaScript debugger. The workspace (written by scripts/build-vscode-tests.mjs in the temporary folder
// of the system) has a folder without tsconfig.json and package.json, whose runs lie in the temporary folder, and a
// folder with a package.json, whose runs lie in its node_modules/.cache/ts/. ts runs with the Node.js of the PATH and
// the TypeScript of VS Code. A tracker records the messages of js-debug: the output with "console": "internalConsole"
// and "outputCapture": "std", and where the program pauses.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Message {
  type: string;
  event?: string;
  body?: Record<string, unknown>;
}

/** The messages that js-debug sent, with their sessions. */
const messages: { session: vscode.DebugSession; message: Message }[] = [];

let workspace: vscode.WorkspaceFolder;

before(() => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the workspace is open');
  workspace = folder;
  vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', {
    createDebugAdapterTracker: (session) => ({ onDidSendMessage: (message: Message) => void messages.push({ session, message }) }),
  });
});

afterEach(async () => {
  await vscode.debug.stopDebugging();
  vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
  messages.splice(0);
});

/** Waits until `check` returns a value. */
async function waitFor<T>(what: string, check: () => T | undefined, timeout = 60_000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    assert.ok(Date.now() < end, `waited for ${what}`);
    await sleep(100);
  }
}

/** Starts a configuration and returns the root session and a promise for its end. */
async function start(config: vscode.DebugConfiguration): Promise<{ root: vscode.DebugSession; ended: Promise<void> }> {
  let root: vscode.DebugSession | undefined;
  const started = vscode.debug.onDidStartDebugSession((session) => {
    if (!session.parentSession && !root) root = session;
  });
  assert.ok(await vscode.debug.startDebugging(workspace, config), 'the session starts');
  started.dispose();
  const session = await waitFor('the session', () => root);
  const ended = new Promise<void>((resolve) => {
    const listener = vscode.debug.onDidTerminateDebugSession((s) => {
      if (s.id === session.id) {
        listener.dispose();
        resolve();
      }
    });
  });
  return { root: session, ended };
}

/** The text of the output of the sessions so far. */
const output = () =>
  messages
    .filter(({ message }) => message.event === 'output')
    .map(({ message }) => String(message.body?.output ?? ''))
    .join('');

/** The next pause of a program, with the top frame of its stack. */
async function nextPause(
  after = 0,
): Promise<{ session: vscode.DebugSession; threadId: number; reason: string; file: string; line: number }> {
  const stop = await waitFor('a pause', () => messages.slice(after).find(({ message }) => message.event === 'stopped'));
  const threadId = stop.message.body?.threadId as number;
  const trace = (await stop.session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 1 })) as {
    stackFrames: { line: number; source?: { path?: string } }[];
  };
  const frame = trace.stackFrames[0];
  return { session: stop.session, threadId, reason: String(stop.message.body?.reason), file: frame?.source?.path ?? '', line: frame?.line ?? 0 };
}

const file = (...parts: string[]) => path.join(workspace.uri.fsPath, ...parts);

/** A configuration of type ts whose output the tracker sees. */
const config = (program: string, more: Record<string, unknown> = {}): vscode.DebugConfiguration => ({
  name: 'Run',
  type: 'ts',
  request: 'launch',
  program,
  console: 'internalConsole',
  outputCapture: 'std',
  ...more,
});

describe('the debug type ts', () => {
  it('runs a file of a folder without tsconfig.json and package.json, in the folder of the file, with its arguments', async () => {
    const { root, ended } = await start(config(file('loose', 'main.ts'), { args: ['Bello'] }));
    await ended;
    assert.match(output(), /Bello: Woof/);
    assert.match(output(), new RegExp(`cwd ${fs.realpathSync(file('loose')).replace(/[/\\.]/g, '\\$&')}`));
    // js-debug turns the configuration of type node into one of type pwa-node, with the command ts.
    assert.equal(root.type, 'pwa-node');
    assert.match(String(root.configuration.runtimeExecutable), /ts$/);
  });

  it('stops at a type error with the message of tsc, and runs nothing', async () => {
    const { ended } = await start(config(file('loose', 'broken.ts')));
    await ended;
    assert.match(output(), /broken\.ts\(1,7\): error TS2322/);
    assert.doesNotMatch(output(), /ran/);
    assert.equal(messages.some(({ message }) => message.event === 'stopped'), false);
  });

  it('pauses at the first statement of the program with stopOnEntry', async () => {
    const { ended } = await start(config(file('loose', 'main.ts'), { stopOnEntry: true }));
    const pause = await nextPause();
    assert.equal(pause.reason, 'entry');
    assert.equal(fs.realpathSync(pause.file), fs.realpathSync(file('loose', 'main.ts')));
    assert.equal(pause.line, 3, 'the first statement after the comment and the import');
    await pause.session.customRequest('continue', { threadId: pause.threadId });
    await ended;
    assert.match(output(), /Rex: Woof/);
  });

  for (const folder of ['loose', 'project']) {
    it(`stops at the breakpoints of the .ts files, in the folder "${folder}"`, async () => {
      const main = vscode.Uri.file(file(folder, 'main.ts'));
      const dog = vscode.Uri.file(file(folder, 'dog.ts'));
      vscode.debug.addBreakpoints([
        new vscode.SourceBreakpoint(new vscode.Location(main, new vscode.Position(3, 0))),
        new vscode.SourceBreakpoint(new vscode.Location(dog, new vscode.Position(3, 0))),
      ]);
      const { ended } = await start(config(main.fsPath));
      const first = await nextPause();
      assert.deepEqual([first.reason, fs.realpathSync(first.file), first.line], ['breakpoint', fs.realpathSync(main.fsPath), 4]);
      const count = messages.length;
      await first.session.customRequest('continue', { threadId: first.threadId });
      const second = await nextPause(count);
      assert.deepEqual([second.reason, fs.realpathSync(second.file), second.line], ['breakpoint', fs.realpathSync(dog.fsPath), 4]);
      await second.session.customRequest('continue', { threadId: second.threadId });
      await ended;
      // ts deletes the folder of the run, and the folders that it created for it.
      assert.equal(fs.existsSync(file(folder, 'node_modules')), false);
    });
  }

  it('runs the program in the integrated terminal, where prompt() reads the keyboard, as a child session of ts', async () => {
    const answer = file('loose', 'answer.txt');
    fs.rmSync(answer, { force: true });
    const children: vscode.DebugSession[] = [];
    const started = vscode.debug.onDidStartDebugSession((session) => void (session.parentSession && children.push(session)));
    const { root, ended } = await start({ name: 'Run', type: 'ts', request: 'launch', program: file('loose', 'ask.ts') });
    // The terminal of the session appears when ts starts, and the session of the program when ts has compiled it.
    const terminal = await waitFor('the terminal', () => vscode.window.terminals.find((t) => t.name.includes('Run')));
    await waitFor('the session of the program', () => children[0]);
    // The program waits in prompt(); what the terminal gets before is not lost either.
    await sleep(500);
    terminal.sendText('Fido');
    await ended;
    started.dispose();
    assert.equal(fs.readFileSync(answer, 'utf8'), 'Fido');
    assert.ok(children.some((child) => child.parentSession?.id === root.id), 'the program is a child session of the session of ts');
  });

  it('runs the file of the active editor without a program, as F5 without launch.json does', async () => {
    await vscode.window.showTextDocument(vscode.Uri.file(file('project', 'main.ts')));
    const { name, type, request } = config('');
    const { ended } = await start({ name, type, request, console: 'internalConsole', outputCapture: 'std' });
    await ended;
    assert.match(output(), /Rex: Woof/);
  });
});
