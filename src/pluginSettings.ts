// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The settings of the editor plugin from VS Code. The plugin (plugin.ts) runs in the TypeScript server, which cannot
// read the settings of VS Code. The extension sends them with configurePlugin of the API of the TypeScript extension
// of VS Code, at its start and after each change: the settings nimblescape.typescript.assignmentFolders and
// nimblescape.typescript.entryFiles (package.json, contributes.configuration), and the folders that VS Code has open,
// which never count as an assignment root (assignmentRoot.ts). An entry of the plugin in tsconfig.json wins over them.

import * as vscode from 'vscode';

/** The TypeScript extension of VS Code. */
const TYPESCRIPT_EXTENSION = 'vscode.typescript-language-features';

/** The name of the plugin (plugin/package.json). */
const PLUGIN_NAME = 'nimblescape-typescript-plugin';

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

/** Sends the settings to the plugin now and after each change; without the TypeScript extension, it does nothing. */
export async function sendPluginSettings(context: vscode.ExtensionContext): Promise<void> {
  const extension = vscode.extensions.getExtension<TypeScriptExtensionApi>(TYPESCRIPT_EXTENSION);
  if (!extension) return;
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
