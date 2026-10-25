// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests in a real VS Code (npm run test:vscode): @vscode/test-cli downloads VS Code to .vscode-test/, starts it
// with the extension of the development build in dist/, and runs the bundled tests of out/test/vscode/
// (scripts/build-vscode-tests.mjs) with mocha in its extension host. Three runs, each with its own user settings
// (out/test/user-data/<label>): "vscode" and "workspace-typescript" open the folder examples/ and ask the TypeScript
// extension of VS Code for completions, with the TypeScript of VS Code and with the TypeScript of the examples
// (typescript.tsdk); "install" opens a course whose packages are not installed; "debug" runs programs with the debug
// type ts in the workspace DEBUG_WORKSPACE, with the Node.js of the PATH. @vscode/test-electron always starts
// VS Code with --disable-workspace-trust, so no run can test Restricted Mode. The packages of the examples must be
// installed (npm ci --ignore-scripts --prefix examples). VSCODE_TEST_VERSION selects the VS Code version: "stable" (the
// default), "insiders" or a version such as 1.125.0. On Linux without a display, run it under xvfb-run.
import * as os from 'node:os';
import * as path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

/** The workspace of the run "debug" (scripts/build-vscode-tests.mjs), outside this repository and its package.json. */
export const DEBUG_WORKSPACE = path.join(os.tmpdir(), 'nimblescape-typescript-test', 'debug');

const version = process.env.VSCODE_TEST_VERSION || 'stable';
const launchArgs = (label) => [
  '--disable-extensions',
  '--disable-workspace-trust',
  '--skip-welcome',
  '--skip-release-notes',
  `--user-data-dir=./out/test/user-data/${label}`,
];
const mocha = {
  ui: 'bdd',
  // The first start of VS Code and of the TypeScript server can be slow on CI runners.
  timeout: 120_000,
};

export default defineConfig([
  {
    label: 'vscode',
    files: 'out/test/vscode/completions.test.js',
    version,
    workspaceFolder: './examples',
    launchArgs: launchArgs('vscode'),
    env: { NIMBLESCAPE_TEST_TYPESCRIPT: 'vscode' },
    mocha,
  },
  {
    label: 'workspace-typescript',
    files: 'out/test/vscode/completions.test.js',
    version,
    workspaceFolder: './examples',
    launchArgs: launchArgs('workspace-typescript'),
    env: { NIMBLESCAPE_TEST_TYPESCRIPT: 'workspace' },
    mocha,
  },
  {
    label: 'install',
    files: 'out/test/vscode/install.test.js',
    version,
    workspaceFolder: './out/test/install/course',
    launchArgs: launchArgs('install'),
    mocha,
  },
  {
    label: 'debug',
    files: 'out/test/vscode/debug.test.js',
    version,
    workspaceFolder: DEBUG_WORKSPACE,
    launchArgs: launchArgs('debug'),
    mocha,
  },
]);
