// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command ts: checks a TypeScript file with tsc, compiles it and runs it with Node.js, like `deno run` with the
// type check. ts is a wrapper around tsc and node: every error comes from tsc or Node.js, and the only additions are
// the polyfills of prompt(), alert() and confirm(). esbuild bundles this file into dist/ts.js of the npm package
// @nimblescape/typescript, whose bin is ts, and into the package of the extension, which puts ts on the PATH of the
// terminals of VS Code.
//
//   ts [file] [arguments]          check, compile and run (default: main.ts of the current folder)
//   ts check [file]                only check
//   ts init                        write tsconfig.json
//   ts install, ts i               install the packages of the project, or without a package.json TypeScript globally
//   ts install --global, ts i -g   install TypeScript globally (in a terminal: select the version from a list)
//   ts completion <shell>          print the Tab completion script
//
// A command word stands first (args.ts); options stand before the file; every word after the file goes to the
// program. `--` ends the options.

import * as fs from 'node:fs';
import * as inspector from 'node:inspector';
import * as path from 'node:path';
import { parseArguments } from './args.ts';
import { checkProject, compile, projectOfFile } from './compile.ts';
import { completionScript } from './completion.ts';
import { init } from './init.ts';
import { installTypeScript, offerInstall, offerUpgrade } from './install.ts';
import { helpText, type Shell } from './options.ts';
import { ensurePackages, installProject } from './packages.ts';
import { createRunFolder, DEBUG_VARIABLE, removeRunFolder, run, TsError } from './run.ts';
import { describe, findTypeScript, MINIMUM_MAJOR, type TypeScriptInstall } from './typescript.ts';

/** The version of ts; esbuild sets it from package.json. */
declare const TS_VERSION: string;

/** The files that ts runs when no file is given. */
const ENTRY_FILES = ['main.ts'];

/**
 * The TypeScript for files in `folder`; installs the packages of the project, or installs or upgrades a global
 * TypeScript, after a question.
 */
async function typeScriptFor(folder: string): Promise<TypeScriptInstall | undefined> {
  let lookup = findTypeScript(folder);
  if ('projectMissing' in lookup) {
    if (!ensurePackages(folder)) return undefined;
    lookup = findTypeScript(folder);
  }
  if ('none' in lookup) {
    if (!(await offerInstall())) return undefined;
    lookup = findTypeScript(folder);
  }
  if (!('found' in lookup)) return undefined;
  if (lookup.found.major < MINIMUM_MAJOR) {
    console.error(`ts needs TypeScript ${MINIMUM_MAJOR} or newer; it found ${describe(lookup.found)}.`);
    if (!(await offerUpgrade(lookup.found))) return undefined;
    return typeScriptFor(folder);
  }
  return lookup.found;
}

/** The file to run or to check: the given one, or the first entry file of the current folder. */
function entryFile(file: string | undefined): string | undefined {
  if (file !== undefined) return file;
  return ENTRY_FILES.find((name) => fs.existsSync(name));
}

async function main(argv: readonly string[]): Promise<number> {
  const command = parseArguments(argv);
  if (typeof command === 'string') {
    console.error(command);
    return 2;
  }
  if (command.help) {
    console.log(helpText(TS_VERSION));
    return 0;
  }
  if (command.completion !== undefined) {
    process.stdout.write(completionScript(command.completion as Shell));
    return 0;
  }
  if (command.version) {
    const lookup = findTypeScript(process.cwd());
    const typescript = 'found' in lookup ? describe(lookup.found) : 'TypeScript: not installed';
    console.log(`ts ${TS_VERSION}\n${typescript}\nNode.js ${process.version}`);
    return 0;
  }
  if (command.install) {
    const project = command.global ? undefined : installProject(process.cwd());
    return (project ?? (await installTypeScript())) ? 0 : 1;
  }
  if (command.init) {
    const typescript = await typeScriptFor(process.cwd());
    return typescript ? init(typescript) : 1;
  }

  const file = entryFile(command.file);
  if (file === undefined) {
    if (command.check && fs.existsSync('tsconfig.json')) {
      const typescript = await typeScriptFor(process.cwd());
      if (!typescript) return 1;
      const config = path.resolve('tsconfig.json');
      const runFolder = createRunFolder(projectOfFile(config));
      try {
        return checkProject(typescript, config, runFolder.folder);
      } finally {
        removeRunFolder(runFolder);
      }
    }
    console.error(`No ${ENTRY_FILES.join(' or ')} in this folder.\n`);
    console.error(helpText(TS_VERSION));
    return 1;
  }
  if (!fs.existsSync(file)) {
    console.error(`The file ${file} does not exist.`);
    return 1;
  }
  const project = projectOfFile(file);
  if (!ensurePackages(path.dirname(project.file))) return 1;
  const typescript = await typeScriptFor(path.dirname(project.file));
  if (!typescript) return 1;
  if (command.check) {
    const runFolder = createRunFolder(project);
    try {
      return compile({ project, typescript, folder: runFolder.folder, checkOnly: true });
    } finally {
      removeRunFolder(runFolder);
    }
  }
  return run(project, typescript, command.args);
}

main(process.argv.slice(2)).then(
  (code) => {
    // In a debug session, the closed connection keeps Node.js from waiting for the debugger to disconnect.
    if (process.env[DEBUG_VARIABLE] && inspector.url() !== undefined) inspector.close();
    process.exitCode = code;
  },
  (error: unknown) => {
    const text = error instanceof TsError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`ts: ${text}`);
    process.exitCode = 1;
  },
);
