// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The assignment root of rule 3 (src/assignmentRoot.ts) with the examples of the plan, the settings, the filter of
// the quick fixes "Add import" (src/autoImportFilter.ts), and the check of the methods of a project before the
// defaults change it (src/projectDefaults.ts). test/tsserver/defaults.test.ts runs rule 3 in the TypeScript server.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assignmentRoot, DEFAULT_SETTINGS, isInside, isOwnFile, readSettings } from '../../src/assignmentRoot.ts';
import { filterImportFixes } from '../../src/autoImportFilter.ts';
import { applyConfiguredDefaults, applyDefaults, assignmentFiles } from '../../src/projectDefaults.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

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

  it('holds the files below it, also in a folder whose name starts with two dots', () => {
    expect(isInside('/workspaces/course', '/workspaces/course')).toBe(true);
    expect(isInside('/workspaces/course', '/workspaces/course/..old/car.ts')).toBe(true);
    expect(isInside('/workspaces/course', '/workspaces/other/car.ts')).toBe(false);
    expect(isInside('/workspaces/course', '/workspaces')).toBe(false);
  });

  it('counts the files of the student, and no file of a package', () => {
    expect(isOwnFile('/workspaces/course/20-assignments/09.01/workspace/car.ts')).toBe(true);
    expect(isOwnFile('/workspaces/course/node_modules/es-toolkit/dist/index.d.mts')).toBe(false);
  });
});

describe('the files of an assignment root', () => {
  it('are its TypeScript files without packages and hidden folders, nearest folders first, from at most 100 folders', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-root-'));
    folders.push(root);
    const write = (name: string) => {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), '');
    };
    for (const name of ['main.ts', 'dog.mts', 'notes.md', 'lib/cat.ts', 'node_modules/x/index.d.ts', '.git/hook.ts']) write(name);
    expect(assignmentFiles(root).map((file) => path.relative(root, file)).sort()).toEqual(['dog.mts', 'lib/cat.ts', 'main.ts']);
    // A wrong root, for example a home folder with a package.json, has many folders: the plugin stops listing them.
    for (let i = 0; i < 150; i++) fs.mkdirSync(path.join(root, 'many', String(i).padStart(3, '0')), { recursive: true });
    write('many/149/far.ts');
    expect(assignmentFiles(root).map((file) => path.relative(root, file))).not.toContain('many/149/far.ts');
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

describe('the setup of the defaults in a project of the TypeScript server', () => {
  it('changes nothing when the project lacks a method that the defaults use', () => {
    const method = () => [];
    const project: Record<string, unknown> = {
      getCurrentDirectory: () => '/course',
      getCompilationSettings: () => ({}),
      setCompilerOptions: method,
      getScriptFileNames: method,
      updateGraph: method,
      fileExists: method,
      readFile: method,
    };
    const before = { ...project };
    // A TypeScript without getRootFiles: the replaced updateGraph would fail at each update of the project.
    expect(() => applyDefaults({} as never, project as never, () => DEFAULT_SETTINGS, () => undefined)).toThrow('no method getRootFiles');
    expect(project).toEqual(before);
    const configured: Record<string, unknown> = { getCompilationSettings: () => ({}), fileExists: method, readFile: method };
    const configuredBefore = { ...configured };
    expect(() => applyConfiguredDefaults(configured as never)).toThrow('no method getScriptFileNames');
    expect(configured).toEqual(configuredBefore);
  });
});
