// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The assignment root of a file, for rule 3 of the filter of the auto-imports (autoImportFilter.ts) and for the files
// that the plugin adds to a project without tsconfig.json (plugin.ts). A course repository holds many assignments, and
// an auto-import from another assignment is never what a student wants: `Car` of 09.01 next to the `Car` of five other
// assignments. The root is the first folder of two searches, from the folder of the file upwards, below the folder
// that VS Code has open (the repository root, which never counts):
//
// 1. A folder that the setting assignmentFolders names (default "workspace"), or that holds package.json or
//    tsconfig.json. The nearest one wins, so a package.json inside workspace/ makes a smaller root.
// 2. Only when the first search finds nothing: a folder with a file that the setting entryFiles names (default
//    main.ts).
//
// Without a root, nothing is hidden. Examples: 20-assignments/09.01/workspace/car.ts gives 09.01/workspace/;
// workspace/server/api.ts with workspace/server/package.json gives workspace/server/; 10-chapters/03/example.ts with
// 10-chapters/03/main.ts gives 10-chapters/03/.

import * as path from 'node:path';

/** The settings of rule 3: from tsconfig.json (compilerOptions.plugins), from VS Code, or the defaults. */
export interface AssignmentSettings {
  readonly assignmentFolders: readonly string[];
  readonly entryFiles: readonly string[];
}

export const DEFAULT_SETTINGS: AssignmentSettings = { assignmentFolders: ['workspace'], entryFiles: ['main.ts'] };

/** The files that mark a folder as an assignment root. */
const MARKER_FILES = ['package.json', 'tsconfig.json'];

/** The settings of a configuration object, with the defaults for what it does not set as a list of names. */
export function readSettings(config: unknown, fallback: AssignmentSettings = DEFAULT_SETTINGS): AssignmentSettings {
  const object = (config ?? {}) as Record<string, unknown>;
  const list = (value: unknown, otherwise: readonly string[]) =>
    Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '') ? (value as string[]) : otherwise;
  return {
    assignmentFolders: list(object.assignmentFolders, fallback.assignmentFolders),
    entryFiles: list(object.entryFiles, fallback.entryFiles),
  };
}

/** True when `file` lies in `folder` or below it. */
export function isInside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The assignment root of `file` (see the head of this file), or undefined. `repositoryRoot` is the folder that VS Code
 * has open; without one, the searches go up to the root of the file system.
 */
export function assignmentRoot(
  file: string,
  repositoryRoot: string | undefined,
  settings: AssignmentSettings,
  exists: (file: string) => boolean,
): string | undefined {
  const folders: string[] = [];
  for (let current = path.dirname(path.resolve(file)); ; current = path.dirname(current)) {
    if (repositoryRoot !== undefined && (!isInside(repositoryRoot, current) || current === path.resolve(repositoryRoot))) break;
    folders.push(current);
    if (path.dirname(current) === current) break;
  }
  const first = folders.find(
    (folder) => settings.assignmentFolders.includes(path.basename(folder)) || MARKER_FILES.some((name) => exists(path.join(folder, name))),
  );
  return first ?? folders.find((folder) => settings.entryFiles.some((name) => exists(path.join(folder, name))));
}

/** True for a module of the student: a file of the program that is no package and no Node.js module. */
export function isOwnFile(fileName: string): boolean {
  return !fileName.split(/[\\/]/).includes('node_modules');
}
