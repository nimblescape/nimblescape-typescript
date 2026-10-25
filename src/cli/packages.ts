// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The packages of a project: when the nearest package.json lists packages that are not installed, ts asks whether
// to install them before it checks the file, because tsc would only report that the imports cannot be found. With a
// package-lock.json, ts runs npm ci (exactly the versions of the lock file), otherwise npm install. Without a
// terminal, ts prints the command and stops (ask.ts).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { askYesNo, canAsk } from './ask.ts';
import { dependencies, packageFolder, projectOf } from './typescript.ts';

/** The packages of the project of `folder` that are not installed, and the folder of its package.json. */
export function missingPackages(folder: string): { root: string; missing: string[] } | undefined {
  const project = projectOf(folder);
  if (!project) return undefined;
  // An optional package may be missing on purpose, for example fsevents on Linux.
  const required = dependencies(project.manifest, ['dependencies', 'devDependencies']);
  const missing = required.filter((name) => packageFolder(name, project.root) === undefined);
  return missing.length > 0 ? { root: project.root, missing } : undefined;
}

/** npm ci when the project has a package-lock.json, else npm install. */
export function installArguments(root: string): string[] {
  return fs.existsSync(path.join(root, 'package-lock.json')) ? ['ci'] : ['install'];
}

/** Installs the missing packages of the project of `folder` after a question; true when nothing is missing anymore. */
export function ensurePackages(folder: string): boolean {
  const missing = missingPackages(folder);
  if (!missing) return true;
  const command = `npm ${installArguments(missing.root).join(' ')}`;
  const relative = path.relative(process.cwd(), missing.root);
  const where = relative === '' ? 'in this folder' : `in ${relative}`;
  const names = missing.missing.join(', ');
  if (!canAsk()) {
    console.error(`The packages of this course are not installed (${names}). Run ${command} ${where}.`);
    return false;
  }
  console.log(`The packages of this course are not installed (${names}).`);
  if (!askYesNo(`Run ${command} ${where} now?`)) return false;
  console.log(`> ${command}`);
  const result = spawnSync('npm', installArguments(missing.root), { cwd: missing.root, stdio: 'inherit' });
  return result.status === 0 && missingPackages(folder) === undefined;
}
