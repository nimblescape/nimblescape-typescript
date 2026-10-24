// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The check of the TypeScript of a workspace folder: does the package.json of the folder list typescript, and is
// node_modules/typescript/lib/tsserver.js missing? Then the editor has no TypeScript of the workspace
// (typescript.tsdk falls back to the TypeScript of VS Code) and no types of the packages, and the extension offers to
// install the packages (installHint.ts). This file does not import 'vscode', so unit tests can run it.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The file of the TypeScript server, relative to the folder: the file that typescript.tsdk needs. */
export const TSSERVER = 'node_modules/typescript/lib/tsserver.js';

/**
 * The result of the check of one folder.
 * - `none`: the package.json of the folder lists no typescript, or the folder uses another package manager than npm.
 * - `installed`: the TypeScript server of the folder exists, or a TypeScript without it is installed (TypeScript 7
 *   and later have no tsserver.js).
 * - `missing`: the package.json lists typescript, and the TypeScript server is missing.
 */
export type InstallState = 'none' | 'installed' | 'missing';

/** The package fields that npm ci and npm install install. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/** The lock files of other package managers than npm. */
const OTHER_LOCK_FILES = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', '.pnp.cjs'];

/** The text of a file of the folder, or undefined when it cannot be read. */
function readText(folder: string, file: string): string | undefined {
  try {
    return fs.readFileSync(path.join(folder, file), 'utf8');
  } catch {
    return undefined;
  }
}

const exists = (folder: string, file: string): boolean => fs.existsSync(path.join(folder, file));

/** True when the package.json of the folder lists typescript in a field that npm installs. */
export function listsTypeScript(folder: string): boolean {
  const text = readText(folder, 'package.json');
  if (text === undefined) return false;
  try {
    const manifest: unknown = JSON.parse(text);
    if (typeof manifest !== 'object' || manifest === null) return false;
    return DEPENDENCY_FIELDS.some((field) => {
      const dependencies = (manifest as Record<string, unknown>)[field];
      return typeof dependencies === 'object' && dependencies !== null && Object.hasOwn(dependencies, 'typescript');
    });
  } catch {
    return false;
  }
}

/** The check of one folder (see InstallState). */
export function installState(folder: string): InstallState {
  if (!listsTypeScript(folder)) return 'none';
  // The hint offers npm, so it stays away from a folder of Yarn, pnpm or Bun.
  if (!exists(folder, 'package-lock.json') && OTHER_LOCK_FILES.some((file) => exists(folder, file))) return 'none';
  if (exists(folder, TSSERVER)) return 'installed';
  // A TypeScript that has no tsserver.js, such as TypeScript 7, is installed: npm ci would not add the file.
  const installed = readText(folder, 'node_modules/typescript/package.json');
  if (installed !== undefined) {
    try {
      const major = Number.parseInt(String(JSON.parse(installed).version), 10);
      if (major >= 7) return 'installed';
    } catch {
      // A broken package.json of TypeScript: npm ci installs it again.
    }
  }
  return 'missing';
}

/** The command that installs the packages of the folder: npm ci with a package-lock.json, else npm install. */
export function installCommand(folder: string): string {
  return exists(folder, 'package-lock.json') ? 'npm ci' : 'npm install';
}
