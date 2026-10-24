// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Entry point of the extension nimblescape TypeScript. The filter of the auto-import completions needs no activation:
// it is a TypeScript server plugin (plugin.ts), which the TypeScript extension of VS Code gives to the TypeScript
// server from the manifest (contributes.typescriptServerPlugins). The activation starts the repair path
// (installHint.ts), when a folder of the workspace has a package.json (activation event workspaceContains).

import type * as vscode from 'vscode';
import { InstallHints, type HintState } from './installHint.ts';

export interface TypeScriptApi {
  /** The state of the install hint of each folder of the workspace, by its path (used by the tests in VS Code, test/vscode). */
  installStates(): Record<string, HintState>;
}

export function activate(context: vscode.ExtensionContext): TypeScriptApi {
  const hints = new InstallHints();
  context.subscriptions.push(hints);
  hints.checkAll();
  return {
    installStates: () => hints.states(),
  };
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
