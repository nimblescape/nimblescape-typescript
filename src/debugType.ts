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
//   (cli/run.ts), always as a real path, where the defaults of js-debug find neither the compiled files nor their
//   source maps. outFiles and resolveSourceMapLocations name these folders. js-debug reads the source maps of the
//   compiled files when the program starts, after tsc wrote them, and sets each breakpoint of a .ts file in the
//   compiled file before the program runs. pauseForSourceMap stays off: its pause comes for ES modules only, never
//   for CommonJS, and js-debug reads outFiles only without it. Without an open folder, js-debug reads no outFiles at
//   all; then the pause for the source maps binds the breakpoints, because a program there is an ES module unless a
//   package.json says otherwise.
// - skipFiles leaves out Node.js itself, the packages and the files of ts (polyfills, tsc), but not the compiled
//   files of the program in node_modules/.cache/ts/. The folder of ts is also named by its real path.
// - The program goes to js-debug as the first of the args, not as program: js-debug replaces a program for which
//   outFiles has a compiled file by that file, and ts runs .ts files only. outFiles has compiled files of the program
//   while another run of it is in progress, or after a run that ended without removing its folder.
// - stopOnEntry does not go to js-debug, whose entry breakpoint goes into the first function of the compiled file when
//   the file declares one before its first statement. ts pauses at the first statement itself, as node --inspect-brk
//   does (NIMBLESCAPE_TS_DEBUG=stop-on-entry, src/runtime/stopOnEntry.ts), also after a restart of the session.
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
import { DEBUG_VARIABLE, realCacheFolder, STOP_ON_ENTRY } from './cli/run.ts';
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

/**
 * A folder and its real path, if that is another one. Node.js names the files of a program by their real paths, so
 * a pattern of js-debug for a folder behind a symbolic link must also name the real path.
 */
function withRealPath(folder: string): string[] {
  try {
    const real = fs.realpathSync(folder);
    return real === folder ? [folder] : [folder, real];
  } catch {
    // The folder does not exist (yet).
    return [folder];
  }
}

/** The folders of the temporary folder of the system in which ts writes its output, also as real paths (macOS). */
function temporaryRunFolders(): string[] {
  return withRealPath(os.tmpdir()).map((folder) => path.join(folder, 'nimblescape-ts-*', '**'));
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
  const { program = '${file}', args = [], stopOnEntry, env, ...attributes } = config;
  return {
    console: 'integratedTerminal',
    cwd: programFolder(program, folder),
    pauseForSourceMap: folder === undefined,
    // The default of js-debug; RunFolderProvider adds the folder of the runs.
    outFiles: folder ? ['${workspaceFolder}/**/*.(m|c|)js', '!**/node_modules/**'] : [],
    resolveSourceMapLocations: [
      // ${workspaceFolder} needs an open folder: VS Code stops a launch whose variable it cannot replace.
      ...(folder ? ['${workspaceFolder}/**'] : []),
      '**/node_modules/.cache/ts/**',
      ...temporaryRunFolders(),
    ],
    skipFiles: [
      '<node_internals>/**',
      '**/node_modules/**',
      '!**/node_modules/.cache/ts/**',
      // The extension can lie behind a symbolic link, and Node.js names the files of ts by their real paths.
      ...withRealPath(ts.packageFolder).map((folder) => `${folder}/**`),
    ],
    // SIGTERM ends the program, and ts then deletes the folder of the run; SIGKILL would leave it.
    killBehavior: 'polite',
    ...attributes,
    type: 'node',
    request: 'launch',
    runtimeExecutable: ts.command,
    args: [program, ...(Array.isArray(args) ? args : [args])],
    env: { ...variables, [DEBUG_VARIABLE]: stopOnEntry === true ? STOP_ON_ENTRY : '1', ...env },
    [MARKER]: true,
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
 * Completes the configuration of js-debug with the folder of the runs of the program, after VS Code replaced the
 * variables of the configuration: as a real path, because a symbolic link named node_modules may point to a folder of
 * another name. js-debug looks for the compiled files there (outFiles; after the patterns of the configuration, so no
 * negation of them leaves out node_modules/.cache/ts/) and takes their source maps (resolveSourceMapLocations).
 */
export class RunFolderProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration {
    const program: unknown = Array.isArray(config.args) ? config.args[0] : undefined;
    if (config[MARKER] !== true || typeof program !== 'string') return config;
    const base = typeof config.cwd === 'string' ? config.cwd : (folder?.uri.fsPath ?? process.cwd());
    const runs = realCacheFolder(projectOfFile(path.resolve(base, program)));
    const add = (list: unknown, pattern: string): unknown => (Array.isArray(list) ? [...list, pattern] : list);
    return {
      ...config,
      outFiles: add(config.outFiles, path.join(runs, '**', '*.(m|c|)js')),
      resolveSourceMapLocations: add(config.resolveSourceMapLocations, path.join(runs, '**')),
    };
  }
}

export function registerDebugType(context: vscode.ExtensionContext): void {
  // The list of "Run and Debug" shows the dynamic configuration under the type ts, also without launch.json; a new
  // launch.json gets initialConfigurations of package.json.
  const runFile: vscode.DebugConfigurationProvider = { provideDebugConfigurations: () => [runFileConfiguration()] };
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, new TsConfigurationProvider(context)),
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, runFile, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugConfigurationProvider(JS_DEBUG_TYPE, new RunFolderProvider()),
  );
}
