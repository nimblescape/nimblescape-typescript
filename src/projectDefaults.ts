// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The defaults of ts in the editor. Without tsconfig.json, the TypeScript server puts the open files into an inferred
// project, whose options VS Code sends (moduleResolution bundler, the types of the browser, no types of Node.js). The
// plugin replaces them with the options of ts in a folder without tsconfig.json (src/defaults.ts): the built-in
// defaults of tsc, the types of Node.js and of prompt(), alert() and confirm() from the type folder of the extension,
// module nodenext, and every file an ES module: without a package.json, the project answers a package.json
// {"type": "module"} at the root of the file system, as ts does. So the editor shows the errors of ts. A project with
// tsconfig.json (a configured project) is not touched.
//
// The inferred project knows only the files that are open and the files that they import; the plugin adds the files
// of the assignment roots of the open files (assignmentRoot.ts), so an auto-import also finds a file of the assignment
// that is not open in a tab.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as ts from 'typescript';
import { assignmentRoot, type AssignmentSettings } from './assignmentRoot.ts';
import { typeRoots } from './cli/compile.ts';
import { DEFAULT_COMPILER_OPTIONS, rootPackageJson, VIRTUAL_PACKAGE_JSON } from './defaults.ts';

/** The TypeScript module of the running TypeScript server. */
type TypeScript = typeof ts;

/** The most files that the plugin adds for one assignment root, so a wrong root cannot load a whole disk. */
const MAX_FILES = 300;

/**
 * The copy of the npm package in the extension, whose types/ and @types/node the editor uses, as ts does in VS Code:
 * cli/ next to dist/, the folder of the bundle of the plugin.
 */
export const CLI_FOLDER = path.resolve(__dirname, '..', 'cli');

/** The options of an inferred project: the defaults of ts, with the type roots of the project folder. */
export function inferredOptions(typescript: TypeScript, folder: string, types = CLI_FOLDER): ts.CompilerOptions {
  const json = { ...DEFAULT_COMPILER_OPTIONS, typeRoots: typeRoots(folder, { NIMBLESCAPE_TS_TYPES: types }) };
  const { options } = typescript.convertCompilerOptionsFromJson(json, folder);
  // The TypeScript server sets this option for every inferred project, so that it accepts files of any name.
  return { ...options, allowNonTsExtensions: true };
}

/** The TypeScript files of an assignment root, without packages and hidden folders. */
export function assignmentFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0 && files.length < MAX_FILES) {
    const folder = pending.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (/\.[cm]?tsx?$/.test(entry.name) && files.length < MAX_FILES) files.push(file);
    }
  }
  return files;
}

/** The part of a project of the TypeScript server that the defaults change. */
interface InferredProject {
  getCurrentDirectory(): string;
  getCompilationSettings(): ts.CompilerOptions;
  setCompilerOptions(options: ts.CompilerOptions): void;
  getScriptFileNames(): string[];
  fileExists(file: string): boolean;
  readFile(file: string, encoding?: string): string | undefined;
}

/**
 * Gives an inferred project the defaults of ts, the virtual package.json and the files of the assignment roots of its
 * files. `settings` gives the settings of the assignment roots when the project needs them, and `repositoryRoot` the
 * folder of a file that VS Code has open.
 */
export function applyDefaults(
  typescript: TypeScript,
  project: InferredProject,
  settings: () => AssignmentSettings,
  repositoryRoot: (file: string) => string | undefined,
): void {
  const options = inferredOptions(typescript, project.getCurrentDirectory());
  // VS Code sends its options again when a setting changes; the defaults replace them each time.
  const setCompilerOptions = project.setCompilerOptions.bind(project);
  project.setCompilerOptions = () => setCompilerOptions({ ...options });
  setCompilerOptions({ ...options });

  // Without a package.json, the project reads {"type": "module"} at the root of the file system.
  const fileExists = project.fileExists.bind(project);
  const readFile = project.readFile.bind(project);
  const isVirtual = (file: string) => path.resolve(file) === rootPackageJson(file) && !fileExists(file);
  project.fileExists = (file) => isVirtual(file) || fileExists(file);
  project.readFile = (file, encoding) => (isVirtual(file) ? VIRTUAL_PACKAGE_JSON : readFile(file, encoding));

  // The files of the assignment roots of the open files. The TypeScript server asks for the names only when a file of
  // the project changed, so a new file of an assignment appears with the next change.
  const getScriptFileNames = project.getScriptFileNames.bind(project);
  project.getScriptFileNames = () => {
    const names = getScriptFileNames();
    const known = new Set(names);
    const roots = new Set<string>();
    for (const name of names) {
      const root = assignmentRoot(name, repositoryRoot(name), settings(), fs.existsSync);
      if (root !== undefined) roots.add(root);
    }
    const extra: string[] = [];
    for (const root of roots) {
      for (const file of assignmentFiles(root)) {
        if (!known.has(file)) {
          known.add(file);
          extra.push(file);
        }
      }
    }
    return [...names, ...extra];
  };
}
