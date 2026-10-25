// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Entry point of the extension nimblescape TypeScript. The editor part needs no activation: it is a TypeScript server
// plugin (plugin.ts), which the TypeScript extension of VS Code gives to the TypeScript server from the manifest
// (contributes.typescriptServerPlugins). The activation, after the start of VS Code in every window
// (onStartupFinished) or for a debug session of the debug type ts:
//
// - gives the terminals of VS Code the command ts and its Tab completion (environment.ts),
// - registers the debug type ts (debugType.ts),
// - sends the settings of the assignment roots to the editor plugin (pluginSettings.ts),
// - starts the repair path (installHint.ts), which offers npm ci when the TypeScript of a project is not installed.

import type * as vscode from 'vscode';
import { registerDebugType } from './debugType.ts';
import { setUpTerminals } from './environment.ts';
import { InstallHints, type HintState } from './installHint.ts';
import { sendPluginSettings } from './pluginSettings.ts';

export interface TypeScriptApi {
  /** The state of the install hint of each folder of the workspace, by its path (used by the tests in VS Code, test/vscode). */
  installStates(): Record<string, HintState>;
}

export function activate(context: vscode.ExtensionContext): TypeScriptApi {
  registerDebugType(context);
  try {
    setUpTerminals(context);
  } catch (error) {
    // Without a writable storage folder of the extension, the terminals have no ts; everything else works.
    console.error('nimblescape TypeScript: the terminals get no ts:', error);
  }
  sendPluginSettings(context).catch((error: unknown) => console.error('nimblescape TypeScript: the plugin gets no settings:', error));
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
