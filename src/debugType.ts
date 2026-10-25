// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The debug type ts: F5 runs a TypeScript file with the command ts in VS Code's JavaScript debugger (js-debug).
//
//   { "name": "Run", "type": "ts", "request": "launch", "program": "${file}" }
//
// The extension has no debug adapter of its own. TsConfigurationProvider turns a configuration of type ts into one of
// type node, with the command ts as runtimeExecutable; js-debug resolves it further (to the type pwa-node) and starts
// ts, which checks and compiles the program with tsc and runs the JavaScript with Node.js. js-debug attaches to every
// Node.js process of the session: to ts itself, as the parent session, and to the program, as its child session.
//
// - The output of tsc lies in node_modules/.cache/ts/ of the project or in the temporary folder of the system
//   (cli/run.ts), where the defaults of js-debug find no source maps. resolveSourceMapLocations names these folders,
//   and pauseForSourceMap makes the program wait for the source map of each compiled file, so a breakpoint in the
//   .ts file holds from the first statement.
// - skipFiles leaves out Node.js itself, the packages and the files of ts (polyfills, tsc), but not the compiled
//   files of the program in node_modules/.cache/ts/.
// - stopOnEntry of js-debug pauses at the first statement of the file that it names, and for a .ts file that is never
//   the file that Node.js runs. So the debug type names the folder of the run (NIMBLESCAPE_TS_RUN) and gives js-debug
//   the path of the compiled file instead; this needs the program with its variables replaced, so
//   EntryFileProvider does it for the configuration of js-debug (type pwa-node).
// - The program runs in the integrated terminal, where prompt() can read the keyboard, and ts loads a module there
//   that clears the terminal before the program starts (NIMBLESCAPE_TS_DEBUG, src/runtime/debugTerminal.ts).
//
// Every attribute of js-debug that a configuration sets itself wins, for example console, cwd, args, env or skipFiles.
// package.json describes the attributes of the type (contributes.debuggers), so VS Code suggests and checks them in
// launch.json. Without launch.json, F5 offers "Run TypeScript file" for the file of the active editor.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { projectOfFile } from './cli/compile.ts';
import { compiledFile, DEBUG_VARIABLE, RUN_VARIABLE, runName } from './cli/run.ts';
import { tsCommand, tsVariables } from './environment.ts';

export const DEBUG_TYPE = 'ts';

/** The type of js-debug for Node.js, which a configuration of type node becomes. */
const JS_DEBUG_TYPE = 'pwa-node';

/** The attribute that marks a configuration of js-debug as one of the debug type ts. */
export const MARKER = '__nimblescapeTs';

/** A launch configuration of type ts (package.json, contributes.debuggers). */
interface TsConfiguration extends vscode.DebugConfiguration {
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | null>;
  console?: string;
  stopOnEntry?: boolean;
}

/** The configuration of F5 without launch.json and of the list of "Run and Debug". */
export function runFileConfiguration(): TsConfiguration {
  return { type: DEBUG_TYPE, request: 'launch', name: 'Run TypeScript file', program: '${file}' };
}

/** The folder of the program, as the default of cwd: a path or an expression with variables of VS Code. */
export function programFolder(program: string, folder: vscode.WorkspaceFolder | undefined): string {
  if (program === '${file}') return '${fileDirname}';
  const parent = path.dirname(program);
  if (path.isAbsolute(parent) || parent.startsWith('${')) return parent;
  return folder ? path.join(folder.uri.fsPath, parent) : '${fileDirname}';
}

/** The folders of the temporary folder of the system in which ts writes its output, also as real paths (macOS). */
function temporaryRunFolders(): string[] {
  const folders = new Set<string>([os.tmpdir()]);
  try {
    folders.add(fs.realpathSync(os.tmpdir()));
  } catch {
    // The temporary folder has no other name.
  }
  return [...folders].map((folder) => path.join(folder, 'nimblescape-ts-*', '**'));
}

/**
 * The configuration of js-debug for a configuration of type ts. `packageFolder` is the folder of the npm package of
 * the ts that runs, whose files (tsc, polyfills) the debugger skips.
 */
export function nodeConfiguration(
  config: TsConfiguration,
  folder: vscode.WorkspaceFolder | undefined,
  ts: { command: string; packageFolder: string },
  variables: Record<string, string>,
): vscode.DebugConfiguration {
  const program = config.program ?? '${file}';
  const { stopOnEntry, env, ...attributes } = config;
  return {
    console: 'integratedTerminal',
    cwd: programFolder(program, folder),
    pauseForSourceMap: true,
    resolveSourceMapLocations: [
      // ${workspaceFolder} needs an open folder: VS Code stops a launch whose variable it cannot replace.
      ...(folder ? ['${workspaceFolder}/**'] : []),
      '**/node_modules/.cache/ts/**',
      ...temporaryRunFolders(),
    ],
    skipFiles: ['<node_internals>/**', '**/node_modules/**', '!**/node_modules/.cache/ts/**', `${ts.packageFolder}/**`],
    ...attributes,
    type: 'node',
    request: 'launch',
    runtimeExecutable: ts.command,
    program,
    env: { ...variables, [DEBUG_VARIABLE]: '1', [RUN_VARIABLE]: runName(), ...env },
    [MARKER]: { stopOnEntry: stopOnEntry === true },
  };
}

/** Turns a configuration of type ts into one of js-debug. */
export class TsConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: TsConfiguration,
  ): vscode.DebugConfiguration | undefined {
    // F5 without launch.json gives an empty configuration.
    const c = config.type || config.request || config.name ? config : runFileConfiguration();
    if (c.request !== 'launch') {
      void vscode.window.showErrorMessage(`The launch configuration "${c.name}" of type "ts" needs "request": "launch".`);
      return undefined;
    }
    return nodeConfiguration(c, folder, tsCommand(this.context), tsVariables(this.context));
  }
}

/**
 * Gives js-debug the compiled file of the program for stopOnEntry. It runs after VS Code replaced the variables of
 * the configuration, so the path of the program is known.
 */
export class EntryFileProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration {
    const marker = config[MARKER] as { stopOnEntry?: boolean } | undefined;
    if (marker?.stopOnEntry !== true || typeof config.program !== 'string') return config;
    const base = typeof config.cwd === 'string' ? config.cwd : (folder?.uri.fsPath ?? process.cwd());
    const run = (config.env as Record<string, string> | undefined)?.[RUN_VARIABLE];
    if (run === undefined) return config;
    return { ...config, stopOnEntry: compiledFile(projectOfFile(path.resolve(base, config.program)), run) };
  }
}

export function registerDebugType(context: vscode.ExtensionContext): void {
  // The list of "Run and Debug" shows the dynamic configuration under the type ts, also without launch.json; a new
  // launch.json gets initialConfigurations of package.json.
  const runFile: vscode.DebugConfigurationProvider = { provideDebugConfigurations: () => [runFileConfiguration()] };
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, new TsConfigurationProvider(context)),
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, runFile, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugConfigurationProvider(JS_DEBUG_TYPE, new EntryFileProvider()),
  );
}
