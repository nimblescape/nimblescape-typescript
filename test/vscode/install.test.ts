// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference types="mocha" />
// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs, run "install"): the workspace is a course whose
// package.json lists typescript and whose packages are not installed (out/test/install/course, written by
// scripts/build-vscode-tests.mjs). The extension activates for its package.json, finds the TypeScript server missing,
// and finds it when the test writes the file, as npm ci does.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { TypeScriptApi } from '../../src/extension.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a course whose packages are not installed', () => {
  it('gets the install hint, and the reload hint when the TypeScript server appears', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(folder, 'the course is open');
    const extension = vscode.extensions.getExtension<TypeScriptApi>('nimblescape.nimblescape-typescript');
    assert.ok(extension, 'the extension is installed');
    // The activation event workspaceContains:package.json activates the extension at the start of the window.
    let end = Date.now() + 15_000;
    while (!extension.isActive) {
      assert.ok(Date.now() < end, 'the extension is active');
      await sleep(200);
    }
    const api = extension.exports;
    assert.deepEqual(api.installStates(), { [folder]: 'missing' });

    const tsserver = path.join(folder, 'node_modules', 'typescript', 'lib', 'tsserver.js');
    fs.mkdirSync(path.dirname(tsserver), { recursive: true });
    fs.writeFileSync(tsserver, '');
    end = Date.now() + 15_000;
    while (api.installStates()[folder] !== 'reload') {
      assert.ok(Date.now() < end, `the extension finds ${tsserver}`);
      await sleep(200);
    }
  });
});
