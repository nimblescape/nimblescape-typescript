// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The run of a file: the folder of the run, the compilation (compile.ts), and Node.js with the compiled file.
//
// The folder of the run lies in node_modules/.cache/ts/ of the project (the folder of the nearest package.json), so
// that Node.js finds the packages of the project from the compiled files; without a package.json, it lies in the
// temporary folder of the system, and the folder of the file stays untouched. Each run has its own folder
// (<process ID>-<machine>-<random>), so two runs never meet, and ts deletes it after the run; a folder of an earlier ts
// whose process does not exist anymore goes at the next start. A process ID tells that only on its own machine: a host
// and its containers can share the folder of a project, each with its own process IDs. So a folder of another machine
// goes only after one day.
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
// waits for the program to end, then ends by the same signal when the signal ended the program.

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
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

/** The signals of Ctrl+C, of kill and of a closed terminal, which reach the program and which ts waits out. */
const PROGRAM_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * The machine of this process, as 8 hexadecimal digits: from the host name and, on Linux, the PID namespace, which
 * tells a container from its host also when both have the same host name.
 */
function machineId(): string {
  let namespace = '';
  try {
    namespace = fs.readlinkSync('/proc/self/ns/pid');
  } catch {
    // Not Linux: the host name alone.
  }
  return createHash('sha256').update(`${os.hostname()} ${namespace}`).digest('hex').slice(0, 8);
}

const MACHINE = machineId();

/** A name of the folder of a run: the ID of the process of ts, its machine, and a random part. */
export function runName(): string {
  return `${process.pid}-${MACHINE}-${randomBytes(4).toString('hex')}`;
}

/**
 * The names that runName() gives, and the names of ts 0.2 and 0.3.0 without the machine (<process ID>-<random>): only
 * such folders are folders of runs.
 */
const RUN_NAME = /^(\d+)-(?:([0-9a-f]{8})-)?[0-9a-f]{8}$/;

/** The age after which the folder of a run of another machine counts as left behind. */
const FOREIGN_RUN_AGE = 24 * 60 * 60 * 1000;

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

/**
 * True when the run of a folder has ended: on this machine, when its process does not exist anymore; on another machine
 * or without a machine in the name (ts 0.3.0 and older), when the folder is older than one day, because the process ID
 * says nothing here.
 */
function runEnded(folder: string, pid: number, machine: string | undefined): boolean {
  if (machine === MACHINE) return pid !== process.pid && !alive(pid);
  try {
    return Date.now() - fs.statSync(folder).mtimeMs > FOREIGN_RUN_AGE;
  } catch {
    return false;
  }
}

/**
 * Deletes the folders of earlier runs that have ended. Only a real folder with a name of runName() counts: when
 * node_modules/.cache/ts is a symbolic link to another folder, its other folders stay, also those whose name starts
 * with a number, such as 2024-photos.
 */
export function removeStaleRuns(cache: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cache, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = RUN_NAME.exec(entry.name);
    const folder = path.join(cache, entry.name);
    if (entry.isDirectory() && name && runEnded(folder, Number(name[1]), name[2])) fs.rmSync(folder, { recursive: true, force: true });
  }
}

/** An error that ts reports with its message only, without the stack. */
export class TsError extends Error {}

/**
 * Makes sure that the folder belongs to this user and only this user can open it, or stops. `link` is the path in the
 * temporary folder of the system, which must not be a symbolic link: another user could point it to a folder of this
 * user.
 */
function ownFolder(folder: string, link: string): void {
  if (typeof process.getuid !== 'function') return;
  if (fs.lstatSync(link).isSymbolicLink()) throw new TsError(`The folder ${link} is a symbolic link. Delete it, then run ts again.`);
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
  if (shared) ownFolder(cache, cacheFolder(project));
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
    for (const signal of PROGRAM_SIGNALS) process.on(signal, ignore);
    return await new Promise<number>((resolve) => {
      child.on('error', (error) => {
        console.error(`ts: Node.js could not start: ${error.message}`);
        cleanup();
        resolve(1);
      });
      child.on('exit', (status, signal) => {
        cleanup();
        // A program that Ctrl+C, kill or a closed terminal ended: ts ends by the same signal, because bash stops a loop
        // or a script after Ctrl+C only when the command ended by the signal, not with the exit code 130.
        if (signal !== null && PROGRAM_SIGNALS.includes(signal)) {
          for (const name of PROGRAM_SIGNALS) process.removeListener(name, ignore);
          process.kill(process.pid, signal);
          return;
        }
        // Another signal, for example of a crash, gets the exit code of the shells: 128 plus the number of the signal.
        resolve(status ?? 128 + (signal ? os.constants.signals[signal] : 0));
      });
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
