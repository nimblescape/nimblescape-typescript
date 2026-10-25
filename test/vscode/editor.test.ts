// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference types="mocha" />
// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs, run "loose"): the editor shows the errors of ts in a
// course without tsconfig.json and package.json (written by scripts/build-vscode-tests.mjs), with the TypeScript of
// VS Code and the options that VS Code sends for such a folder, which the plugin replaces with the defaults of ts.

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the editor in a folder without tsconfig.json and package.json', () => {
  it('shows the errors of ts: imports with the extension, the types of Node.js and prompt(), no browser', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the workspace is open');
    const uri = vscode.Uri.file(path.join(folder.uri.fsPath, 'loose', 'check.ts'));
    await vscode.window.showTextDocument(uri);
    // The first start of the TypeScript server reads the types of Node.js; the errors come after it.
    const end = Date.now() + 90_000;
    let codes: string[] = [];
    while (Date.now() < end) {
      codes = vscode.languages
        .getDiagnostics(uri)
        .filter((diagnostic) => diagnostic.source === 'ts')
        .map((diagnostic) => String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code))
        .sort();
      if (codes.length >= 2) break;
      await sleep(250);
    }
    // TS2835: "./dog" needs the extension .ts; TS2584: document is no name of Node.js.
    assert.deepEqual(codes, ['2584', '2835']);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
