// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The assignment root of rule 3 (src/assignmentRoot.ts) with the examples of the plan, the settings, and the filter of
// the quick fixes "Add import" (src/autoImportFilter.ts). test/tsserver/defaults.test.ts runs rule 3 in the
// TypeScript server.

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignmentRoot, DEFAULT_SETTINGS, isOwnFile, readSettings } from '../../src/assignmentRoot.ts';
import { filterImportFixes } from '../../src/autoImportFilter.ts';

const repository = '/workspaces/course';
/** A file system with these files of the repository. */
const files = (...names: string[]) => {
  const all = new Set(names.map((name) => path.join(repository, name)));
  return (file: string) => all.has(file);
};
const rootOf = (file: string, exists: (file: string) => boolean, settings = DEFAULT_SETTINGS) =>
  assignmentRoot(path.join(repository, file), repository, settings, exists);

describe('the assignment root', () => {
  it('is the nearest folder named workspace, or with package.json or tsconfig.json', () => {
    const exists = files('package.json', '20-assignments/09.01/workspace/server/package.json');
    expect(rootOf('20-assignments/09.01/workspace/car.ts', exists)).toBe(path.join(repository, '20-assignments/09.01/workspace'));
    expect(rootOf('20-assignments/09.01/workspace/server/api.ts', exists)).toBe(path.join(repository, '20-assignments/09.01/workspace/server'));
  });

  it('is the folder with an entry file when no such folder exists, and the repository root never counts', () => {
    const exists = files('tsconfig.json', 'package.json', '10-chapters/03/main.ts', 'main.ts');
    expect(rootOf('10-chapters/03/example.ts', exists)).toBe(path.join(repository, '10-chapters/03'));
    expect(rootOf('10-chapters/04/example.ts', exists)).toBeUndefined();
    expect(rootOf('main.ts', exists)).toBeUndefined();
  });

  it('takes the folder names and the entry files of the settings', () => {
    const settings = readSettings({ assignmentFolders: ['task'], entryFiles: ['app.ts'] });
    expect(settings).toEqual({ assignmentFolders: ['task'], entryFiles: ['app.ts'] });
    expect(rootOf('a/task/b/x.ts', files(), settings)).toBe(path.join(repository, 'a/task'));
    expect(rootOf('a/workspace/x.ts', files('a/app.ts'), settings)).toBe(path.join(repository, 'a'));
    // A value that is no list of names keeps the fallback.
    expect(readSettings({ assignmentFolders: 'workspace', entryFiles: [1] })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(undefined, settings)).toEqual(settings);
  });

  it('counts the files of the student, and no file of a package', () => {
    expect(isOwnFile('/workspaces/course/20-assignments/09.01/workspace/car.ts')).toBe(true);
    expect(isOwnFile('/workspaces/course/node_modules/es-toolkit/dist/index.d.mts')).toBe(false);
  });
});

describe('the quick fixes of rule 3', () => {
  const fix = (fixName: string, newText: string) => ({ fixName, description: `${fixName}: ${newText}`, changes: [{ fileName: '', textChanges: [{ span: { start: 0, length: 0 }, newText }] }] });
  const file = path.join(repository, '20-assignments/09.01/workspace/main.ts');
  const root = path.dirname(file);

  it('hides an import of a file of another assignment, and keeps packages, Node.js and other fixes', () => {
    const fixes = [
      fix('import', 'import { Car } from "./car.ts";\n'),
      fix('import', "import { Car } from '../../09.02/workspace/car.ts';\n"),
      fix('import', 'import { round } from "es-toolkit";\n'),
      fix('import', 'import { readFileSync } from "node:fs";\n'),
      fix('spelling', 'Cars'),
    ];
    expect(filterImportFixes(fixes, file, root).map((f) => f.description)).toEqual([
      'import: import { Car } from "./car.ts";\n',
      'import: import { round } from "es-toolkit";\n',
      'import: import { readFileSync } from "node:fs";\n',
      'spelling: Cars',
    ]);
    expect(filterImportFixes(fixes, file, undefined)).toHaveLength(5);
  });
});
