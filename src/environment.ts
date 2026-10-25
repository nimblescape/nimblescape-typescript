// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command ts in VS Code. The package of the extension holds a copy of the npm package @nimblescape/typescript in
// cli/. The extension gives the terminals of VS Code (environmentVariableCollection) and the debug sessions of the
// debug type ts (debugType.ts) what ts needs to work as the editor does:
//
// - PATH ends with a folder of the extension that holds `ts`, a small shell script that starts cli/dist/ts.js with the
//   Node.js of the PATH. It stands at the end, so a global ts (npm install --global @nimblescape/typescript, as the
//   image of the Devspace installs it) comes first and decides the version.
// - NIMBLESCAPE_TS_TYPESCRIPT names the folder of the TypeScript that VS Code uses: its own, or the folder of the user
//   setting js/ts.tsdk.path (typescript.tsdk before VS Code 1.143). ts takes it when the project pins no TypeScript.
// - NIMBLESCAPE_TS_TYPES names cli/, whose types/ and @types/node the editor plugin uses too, so the editor and ts
//   check with the same types.
// - XDG_DATA_DIRS (bash) and FPATH (zsh) get a folder with the Tab completion scripts of ts (completion.ts).
//
// The terminals that are open when the extension starts get the change after a restart; VS Code shows that on their
// tabs. VS Code keeps the collection for the next start of the window, so its terminals have it from the start.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TYPES_VARIABLE } from './cli/compile.ts';
import { completionScript } from './cli/completion.ts';
import { VSCODE_TYPESCRIPT_VARIABLE } from './cli/typescript.ts';

/** The folder of the copy of the npm package in the extension. */
export function cliFolder(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, 'cli');
}

/** The script of ts in the extension, which Node.js runs. */
export function tsScript(context: vscode.ExtensionContext): string {
  return path.join(cliFolder(context), 'dist', 'ts.js');
}

/** The end of the real path of the command ts of the npm package @nimblescape/typescript. */
const PACKAGE_SCRIPT = path.join('@nimblescape', 'typescript', 'dist', 'ts.js');

/** The command ts and the folder of its package. */
export interface TsCommand {
  readonly command: string;
  readonly packageFolder: string;
}

/**
 * The command ts that `npm install --global @nimblescape/typescript` put on the PATH of VS Code, if any: a file ts in
 * a folder of the PATH whose real path is the script of the package. Another command named ts, such as the one of
 * moreutils, does not count.
 */
export function globalTs(environment: NodeJS.ProcessEnv = process.env): TsCommand | undefined {
  for (const folder of (environment.PATH ?? '').split(path.delimiter)) {
    if (folder === '') continue;
    const command = path.join(folder, 'ts');
    try {
      const real = fs.realpathSync(command);
      if (real.endsWith(path.sep + PACKAGE_SCRIPT)) return { command, packageFolder: path.dirname(path.dirname(real)) };
    } catch {
      // No ts in this folder.
    }
  }
  return undefined;
}

/** Writes the shell script that starts the ts of the extension, and returns its path. */
export function writeTsScript(context: vscode.ExtensionContext): string {
  const file = path.join(context.globalStorageUri.fsPath, 'bin', 'ts');
  // The script names the script of this version of the extension; an update of the extension writes it again.
  writeIfChanged(file, `#!/bin/sh\n# ts of the extension nimblescape TypeScript\nexec node "${tsScript(context)}" "$@"\n`, 0o755);
  return file;
}

/** The ts that a debug session runs: a global ts wins over the ts of the extension, as on the PATH of the terminals. */
export function tsCommand(context: vscode.ExtensionContext): TsCommand {
  return globalTs() ?? { command: writeTsScript(context), packageFolder: cliFolder(context) };
}

/** The value of a setting of the TypeScript extension that the user set in the user settings, if any. */
function userSetting(section: string, key: string): string | undefined {
  const value = vscode.workspace.getConfiguration(section).inspect<string>(key)?.globalValue;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The folder of the package typescript that VS Code uses outside a project that pins one: the folder of the user
 * setting js/ts.tsdk.path (or typescript.tsdk), which names its lib/ folder, else the TypeScript of VS Code.
 */
export function vscodeTypeScript(): string {
  const tsdk = userSetting('js/ts', 'tsdk.path') ?? userSetting('typescript', 'tsdk');
  if (tsdk !== undefined && path.isAbsolute(tsdk) && fs.existsSync(path.join(tsdk, 'typescript.js'))) return path.dirname(tsdk);
  return path.join(vscode.env.appRoot, 'extensions', 'node_modules', 'typescript');
}

/** The variables that ts needs in VS Code, for a debug session. */
export function tsVariables(context: vscode.ExtensionContext): Record<string, string> {
  return { [VSCODE_TYPESCRIPT_VARIABLE]: vscodeTypeScript(), [TYPES_VARIABLE]: cliFolder(context) };
}

/** Writes a file only when its text changed, so a start of VS Code writes nothing in most cases. */
function writeIfChanged(file: string, text: string, mode = 0o644): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let current: string | undefined;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = undefined;
  }
  if (current !== text) fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
}

/** The default fpath of zsh, without the start files of the user; undefined without zsh. */
function zshFunctionPath(): string | undefined {
  const result = spawnSync('zsh', ['-fc', 'print -r -- $FPATH'], { encoding: 'utf8', timeout: 5000 });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return value || undefined;
}

/** Sets the variables of the terminals (see the head of this file). */
export function setUpTerminals(context: vscode.ExtensionContext): void {
  const storage = context.globalStorageUri.fsPath;
  const bin = path.dirname(writeTsScript(context));
  const completion = path.join(storage, 'completion');
  writeIfChanged(path.join(completion, 'bash-completion', 'completions', 'ts'), completionScript('bash'));
  writeIfChanged(path.join(completion, 'zsh', '_ts'), completionScript('zsh'));

  const collection = context.environmentVariableCollection;
  collection.clear();
  collection.description = 'Adds the command ts of nimblescape TypeScript and its Tab completion.';
  collection.append('PATH', `${path.delimiter}${bin}`);
  for (const [name, value] of Object.entries(tsVariables(context))) collection.replace(name, value);
  // An unset XDG_DATA_DIRS means /usr/local/share:/usr/share, which bash-completion then still has to read.
  const dataDirs = process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share';
  collection.replace('XDG_DATA_DIRS', `${dataDirs}${path.delimiter}${completion}`);
  // FPATH replaces the whole fpath of zsh, so it keeps the folders of zsh itself.
  const fpath = process.env.FPATH || zshFunctionPath();
  if (fpath !== undefined) collection.replace('FPATH', `${fpath}${path.delimiter}${path.join(completion, 'zsh')}`);
}
