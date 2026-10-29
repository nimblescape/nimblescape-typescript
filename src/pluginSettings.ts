// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The settings of the editor plugin from VS Code. The plugin (plugin.ts) runs in the TypeScript server, which cannot
// read the settings of VS Code. The extension sends them with configurePlugin of the API of the TypeScript extension
// of VS Code, when the TypeScript extension runs and after each change: the settings
// nimblescape.typescript.assignmentFolders and nimblescape.typescript.entryFiles (package.json,
// contributes.configuration), and the folders that VS Code has open, which never count as an assignment root
// (assignmentRoot.ts). An entry of the plugin in tsconfig.json wins over them.
//
// The extension never starts the TypeScript extension itself: it waits until VS Code starts it for a document of the
// TypeScript server, so a window without TypeScript and JavaScript files keeps it off. The TypeScript extension keeps
// the settings and gives them to each start of the TypeScript server.

import * as vscode from 'vscode';

/** The TypeScript extension of VS Code. */
const TYPESCRIPT_EXTENSION = 'vscode.typescript-language-features';

/** The name of the plugin (plugin/package.json). */
const PLUGIN_NAME = 'nimblescape-typescript-plugin';

/** The languages of the TypeScript server: VS Code starts the TypeScript extension and its server for them. */
const SERVER_LANGUAGES = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact']);

/** The part of the API of the TypeScript extension that the extension uses. */
interface TypeScriptExtensionApi {
  getAPI(version: 0): { configurePlugin(pluginId: string, configuration: unknown): void } | undefined;
}

/** What the plugin gets. */
export function pluginConfiguration(): Record<string, unknown> {
  const settings = vscode.workspace.getConfiguration('nimblescape.typescript');
  return {
    assignmentFolders: settings.get<string[]>('assignmentFolders'),
    entryFiles: settings.get<string[]>('entryFiles'),
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
  };
}

/**
 * Resolves when the TypeScript extension runs, or when a document opens for which VS Code starts it. Another way to
 * start it, for example a command of another extension, counts at the next document that opens.
 */
function typeScriptStarted(extension: vscode.Extension<unknown>, context: vscode.ExtensionContext): Promise<void> {
  const starts = (document: vscode.TextDocument) => extension.isActive || SERVER_LANGUAGES.has(document.languageId);
  if (extension.isActive || vscode.workspace.textDocuments.some(starts)) return Promise.resolve();
  return new Promise((resolve) => {
    const listener = vscode.workspace.onDidOpenTextDocument((document) => {
      if (!starts(document)) return;
      listener.dispose();
      resolve();
    });
    context.subscriptions.push(listener);
  });
}

/**
 * Sends the settings to the plugin when the TypeScript extension runs, and after each change; without the TypeScript
 * extension, it does nothing.
 */
export async function sendPluginSettings(context: vscode.ExtensionContext): Promise<void> {
  const extension = vscode.extensions.getExtension<TypeScriptExtensionApi>(TYPESCRIPT_EXTENSION);
  if (!extension) return;
  await typeScriptStarted(extension, context);
  // VS Code starts the extension at this moment anyway; activate() returns its API.
  const api = (await extension.activate())?.getAPI?.(0);
  if (!api) return;
  const send = () => api.configurePlugin(PLUGIN_NAME, pluginConfiguration());
  send();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nimblescape.typescript')) send();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(send),
  );
}
