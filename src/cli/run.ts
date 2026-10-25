// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The run of a file: the folder of the run, the compilation (compile.ts), and Node.js with the compiled file.
//
// The folder of the run lies in node_modules/.cache/ts/ of the project (the folder of the nearest package.json), so
// that Node.js finds the packages of the project from the compiled files; without a package.json, it lies in the
// temporary folder of the system, and the folder of the file stays untouched. Each run has its own folder
// (<process ID>-<random>), so two runs never meet, and ts deletes it after the run; a folder of an earlier ts whose
// process does not exist anymore goes at the next start.
//
// The folder of the runs in the temporary folder of the system is for the user only (mode 700), so no other user can
// change the output between the check and the run. The folder of the run is a real path, without symbolic links: tsc
// writes the sources of a source map relative to the folder of the map, and Node.js and the debugger resolve them
// from the real path of the compiled file. A symbolic link on the way (a linked node_modules, the temporary folder of
// macOS) would point the maps to other files.
//
// Node.js runs in the folder where ts was started, with the source maps of tsc (--enable-source-maps), so an error
// names the line of the .ts file, and with the polyfills of prompt(), alert() and confirm() (polyfill.ts). In a debug
// session of the debug type ts (NIMBLESCAPE_TS_DEBUG), it also loads debug-terminal.ts, and with stopOnEntry
// stopOnEntry.ts. ts waits for the program and ends with its exit code; Ctrl+C reaches both processes, and ts only
// waits for the program to end.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, outputFile, type Job, type Project } from './compile.ts';
import type { TypeScriptInstall } from './typescript.ts';

/** The environment variable that the debug type ts sets for its sessions: "1", or STOP_ON_ENTRY. */
export const DEBUG_VARIABLE = 'NIMBLESCAPE_TS_DEBUG';

/** The value of DEBUG_VARIABLE for a session that pauses at the first statement of the program (stopOnEntry). */
export const STOP_ON_ENTRY = 'stop-on-entry';

/** A name of the folder of a run: the ID of the process of ts, and a random part. */
function runName(): string {
  return `${process.pid}-${randomBytes(4).toString('hex')}`;
}

/** The folder that holds the folders of the runs of a project. */
export function cacheFolder(project: Project): string {
  if (project.packageRoot !== undefined) return path.join(project.packageRoot, 'node_modules', '.cache', 'ts');
  const user = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().username;
  return path.join(os.tmpdir(), `nimblescape-ts-${user}`);
}

/** A path with the real path of its nearest existing folder, as Node.js names a file that does not exist yet. */
function realPathOfNew(file: string): string {
  const rest: string[] = [];
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse());
    } catch {
      if (path.dirname(current) === current) return path.resolve(file);
      rest.push(path.basename(current));
    }
  }
}

/** The folder of the folders of the runs, as a real path, also before it exists. */
export function realCacheFolder(project: Project): string {
  return realPathOfNew(cacheFolder(project));
}

/** True when a process with this ID runs. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Deletes the folders of earlier runs whose process does not exist anymore. */
function removeStaleRuns(cache: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(cache);
  } catch {
    return;
  }
  for (const name of names) {
    const pid = Number(/^(\d+)-/.exec(name)?.[1]);
    if (pid && pid !== process.pid && !alive(pid)) fs.rmSync(path.join(cache, name), { recursive: true, force: true });
  }
}

/** An error that ts reports with its message only, without the stack. */
export class TsError extends Error {}

/** Makes sure that the folder belongs to this user and only this user can open it, or stops. */
function ownFolder(folder: string): void {
  if (typeof process.getuid !== 'function') return;
  const stat = fs.statSync(folder);
  if (stat.uid !== process.getuid()) throw new TsError(`The folder ${folder} belongs to another user. Delete it, then run ts again.`);
  if ((stat.mode & 0o077) !== 0) fs.chmodSync(folder, 0o700);
}

/** Creates the folder of a run; returns it and the first folder that it had to create, for the cleanup. */
export function createRunFolder(project: Project): { folder: string; created: string | undefined } {
  const shared = project.packageRoot === undefined;
  // The folder in the temporary folder of the system is for this user only: no other user may write the output
  // between the check and the run.
  const made = fs.mkdirSync(cacheFolder(project), { recursive: true, mode: shared ? 0o700 : 0o777 });
  const cache = realCacheFolder(project);
  if (shared) ownFolder(cache);
  const created = made === undefined ? undefined : fs.realpathSync(made);
  removeStaleRuns(cache);
  const folder = path.join(cache, runName());
  fs.mkdirSync(folder);
  return { folder, created };
}

/** Deletes the folder of a run, and the folders that ts created for it, when they are empty. */
export function removeRunFolder(run: { folder: string; created: string | undefined }): void {
  fs.rmSync(run.folder, { recursive: true, force: true });
  if (run.created === undefined) return;
  for (let current = path.dirname(run.folder); current.startsWith(run.created); current = path.dirname(current)) {
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
  }
}

/**
 * The environment of the program: the one of ts without the variable of the debug type ts, which only this ts reads,
 * so a ts that the program starts runs as in a terminal.
 */
function programEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { [DEBUG_VARIABLE]: _debug, ...rest } = environment;
  return rest;
}

/** The files of this package that Node.js loads before the program. */
function preloads(environment: NodeJS.ProcessEnv): string[] {
  const files = ['polyfill.mjs'];
  const debug = environment[DEBUG_VARIABLE];
  if (debug) files.push('debug-terminal.mjs');
  if (debug === STOP_ON_ENTRY) files.push('stop-on-entry.mjs');
  return files.flatMap((name) => ['--import', pathToFileURL(path.join(__dirname, name)).href]);
}

/** Checks, compiles and runs a file; resolves with the exit code for ts. */
export async function run(project: Project, typescript: TypeScriptInstall, args: readonly string[]): Promise<number> {
  const runFolder = createRunFolder(project);
  const cleanup = () => removeRunFolder(runFolder);
  try {
    const job: Job = { project, typescript, folder: runFolder.folder, checkOnly: false };
    const code = compile(job);
    if (code !== 0) {
      cleanup();
      return code;
    }
    const child = spawn(process.execPath, ['--enable-source-maps', ...preloads(process.env), outputFile(job), ...args], {
      stdio: 'inherit',
      env: programEnvironment(process.env),
    });
    // Ctrl+C and a closed terminal reach the program too; ts ends after the program.
    const ignore = () => {};
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, ignore);
    return await new Promise<number>((resolve) => {
      child.on('error', (error) => {
        console.error(`ts: Node.js could not start: ${error.message}`);
        cleanup();
        resolve(1);
      });
      child.on('exit', (status, signal) => {
        cleanup();
        // A program that a signal ended gets the exit code of the shells: 128 plus the number of the signal.
        resolve(status ?? 128 + (signal ? os.constants.signals[signal] : 0));
      });
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
