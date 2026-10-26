// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference types="mocha" />
// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs, runs "vscode" and "workspace-typescript"): mocha runs
// them in the extension host, in the folder examples/. They ask the TypeScript extension of VS Code for the completions
// of names in a TypeScript file, as the editor does while a student types, and read the log of the TypeScript server:
// the TypeScript server of VS Code or of the examples (NIMBLESCAPE_TEST_TYPESCRIPT) loaded the plugin of the extension.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const TYPESCRIPT = process.env.NIMBLESCAPE_TEST_TYPESCRIPT === 'workspace' ? 'workspace' : 'vscode';
const TIMEOUT = 90_000;

// prompt is a global of ts, also in a project with tsconfig.json, so the plugin hides prompt of @majikmate/ts-utils.
const HIDDEN = ['log', 'warn', 'exit', 'argv', 'env', 'parseInt', 'escape', 'prompt'];
const KEPT: Record<string, string[]> = {
  Dog: ['./dog.ts'],
  round: ['es-toolkit'],
  randomInt: ['es-toolkit', 'node:crypto'],
  existsSync: ['node:fs'],
  readFileSync: ['node:fs'],
  on: ['node:events'],
  once: ['node:events'],
};

function examples(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the folder examples is open');
  return folder.uri.fsPath;
}

/**
 * The modules of the auto-imports of `name`: the TypeScript extension shows the module as the description of the label.
 * A snippet, such as `log` (console.log) of VS Code, also has a description, and is no auto-import.
 */
function sources(items: readonly vscode.CompletionItem[], name: string): string[] {
  const modules: string[] = [];
  for (const item of items) {
    if (item.kind === vscode.CompletionItemKind.Snippet) continue;
    if (typeof item.label === 'string' || item.label.label !== name || !item.label.description) continue;
    modules.push(item.label.description);
  }
  return modules;
}

/** The names of the items without a module, as the global names. */
function plain(items: readonly vscode.CompletionItem[], name: string): boolean {
  return items.some((item) => (typeof item.label === 'string' ? item.label === name : item.label.label === name && !item.label.description));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe(`completions with the TypeScript of ${TYPESCRIPT === 'workspace' ? 'the examples' : 'VS Code'}`, () => {
  let editor: vscode.TextEditor;
  let file: string;

  /** The completion items at the end of the file after `name`, once the list is complete. */
  async function complete(name: string): Promise<vscode.CompletionItem[]> {
    const text = `const greeting = 'Hello';\n${name}`;
    await editor.edit((edit) => edit.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), text));
    const end = editor.document.positionAt(text.length);
    let list: vscode.CompletionList | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', editor.document.uri, end);
      if (!list.isIncomplete) break;
      await sleep(250);
    }
    return list?.items ?? [];
  }

  before(async function () {
    this.timeout(TIMEOUT * 2);
    // .gitignore keeps examples/*-test.ts out of Git.
    file = path.join(examples(), 'completion-test.ts');
    fs.writeFileSync(file, '\n');
    editor = await vscode.window.showTextDocument(vscode.Uri.file(file));
    // The TypeScript server reads the types of the packages of the examples first; until then, it offers no
    // auto-import of es-toolkit.
    const end = Date.now() + TIMEOUT;
    while (!sources(await complete('round'), 'round').includes('es-toolkit')) {
      assert.ok(Date.now() < end, 'the TypeScript server offers round from es-toolkit');
      await sleep(1000);
    }
  });

  after(() => {
    fs.rmSync(file, { force: true });
  });

  it('hides the auto-imports of globals and of the modules that export a global', async () => {
    for (const name of HIDDEN) {
      const items = await complete(name);
      assert.deepEqual(sources(items, name), [], name);
    }
    for (const name of ['parseInt', 'escape', 'prompt']) assert.ok(plain(await complete(name), name), `the global ${name}`);
  });

  it('keeps the auto-imports that a program needs', async () => {
    for (const [name, modules] of Object.entries(KEPT)) {
      const offered = sources(await complete(name), name);
      for (const module of modules) assert.ok(offered.includes(module), `${name} from ${module} in ${offered.join(', ')}`);
    }
    assert.ok(!sources(await complete('on'), 'on').includes('node:process'), 'on from node:process');
  });

  it('runs in the TypeScript server that the settings choose', async () => {
    await vscode.commands.executeCommand('typescript.openTsServerLog');
    const end = Date.now() + 10_000;
    while (!vscode.window.activeTextEditor?.document.fileName.endsWith('tsserver.log')) {
      assert.ok(Date.now() < end, 'VS Code opens the log of the TypeScript server');
      await sleep(200);
    }
    const log = vscode.window.activeTextEditor.document.getText();
    const plugin = /nimblescape-typescript-plugin: filters the auto-import completions of .* with TypeScript (\S+)/.exec(log);
    assert.ok(plugin, 'the TypeScript server loaded the plugin');
    const workspaceServer = path.join(examples(), 'node_modules', 'typescript', 'lib', 'tsserver.js');
    if (TYPESCRIPT === 'workspace') {
      assert.ok(log.includes(workspaceServer), `the TypeScript server of the examples runs: ${workspaceServer}`);
      assert.equal(plugin[1], '6.0.3');
    } else {
      assert.ok(!log.includes(workspaceServer), 'the TypeScript server of VS Code runs');
    }
    console.log(`TypeScript ${plugin[1]} (${TYPESCRIPT === 'workspace' ? 'the examples' : 'VS Code'}) loaded the plugin.`);
  });
});
