// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Which TypeScript ts uses. ts follows VS Code and names no TypeScript of its own:
//
// 1. The TypeScript of the project, when the nearest package.json lists typescript (a course or a Vite project that
//    pins its version).
// 2. Inside VS Code, the TypeScript of VS Code: the extension gives its folder in NIMBLESCAPE_TS_TYPESCRIPT to the
//    terminals and the debug sessions, so the editor, ts, F5 and Mindbug use the same TypeScript.
// 3. The global TypeScript (npm install --global typescript).
//
// TypeScript 6 or newer is required: ts needs rewriteRelativeImportExtensions, and 5.7 to 5.9 are not supported.
// When no TypeScript is found, ts offers to install one globally (install.ts).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findUp } from '../defaults.ts';

/** The lowest major version of TypeScript that ts supports. */
export const MINIMUM_MAJOR = 6;

/** The environment variable with the folder of the TypeScript of VS Code (set by the extension). */
export const VSCODE_TYPESCRIPT_VARIABLE = 'NIMBLESCAPE_TS_TYPESCRIPT';

export interface TypeScriptInstall {
  /** The folder of the package typescript, which holds package.json. */
  readonly folder: string;
  readonly version: string;
  readonly major: number;
  /** Where ts found it. */
  readonly source: 'project' | 'vscode' | 'global';
}

/** The dependency fields of package.json that npm installs. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/** The parsed package.json of a folder, or undefined when it is missing or broken. */
export function readManifest(folder: string): Record<string, unknown> | undefined {
  try {
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
    return typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The names of the packages that the package.json of a folder lists in the fields that npm installs, or in `fields`.
 */
export function dependencies(manifest: Record<string, unknown>, fields: readonly string[] = DEPENDENCY_FIELDS): string[] {
  const names = new Set<string>();
  for (const field of fields) {
    const value = manifest[field];
    if (typeof value === 'object' && value !== null) for (const name of Object.keys(value)) names.add(name);
  }
  return [...names];
}

/** The TypeScript of a folder that holds the package typescript, or undefined when it is not there. */
export function typeScriptAt(folder: string, source: TypeScriptInstall['source']): TypeScriptInstall | undefined {
  const manifest = readManifest(folder);
  if (manifest?.name !== 'typescript' || typeof manifest.version !== 'string') return undefined;
  return { folder, version: manifest.version, major: Number.parseInt(manifest.version, 10), source };
}

/** The folder of the package `name` that Node.js finds from `folder` (node_modules of the folder and above). */
export function packageFolder(name: string, folder: string): string | undefined {
  for (let current = path.resolve(folder); ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(current) === current) return undefined;
  }
}

/** The project of a folder: the nearest folder with a package.json, and whether that package.json lists typescript. */
export function projectOf(folder: string): { root: string; manifest: Record<string, unknown> } | undefined {
  const root = findUp(folder, 'package.json', fs.existsSync);
  const manifest = root === undefined ? undefined : readManifest(root);
  return root === undefined || manifest === undefined ? undefined : { root, manifest };
}

/** The global node_modules folders that may hold TypeScript, nearest first. */
function globalFolders(): string[] {
  const folders: string[] = [];
  // ts itself installed globally: <global>/node_modules/@nimblescape/typescript/dist/ts.js.
  const own = path.resolve(__dirname, '..', '..', '..');
  if (path.basename(own) === 'node_modules') folders.push(own);
  // The default prefix of npm: <prefix>/bin/node and <prefix>/lib/node_modules.
  folders.push(path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules'));
  return folders;
}

/** The global node_modules folder of npm (npm root --global), which can take some 100 ms. */
function npmGlobalFolder(): string | undefined {
  const result = spawnSync('npm', ['root', '--global'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const folder = result.status === 0 ? result.stdout.trim() : '';
  return folder || undefined;
}

export type Lookup =
  | { readonly found: TypeScriptInstall }
  /** The project lists typescript, but it is not installed: npm ci helps (packages.ts asks before). */
  | { readonly projectMissing: string }
  /** No TypeScript at all. */
  | { readonly none: true };

/** Finds the TypeScript for a file in `folder` (see the head of this file). */
export function findTypeScript(folder: string, environment: NodeJS.ProcessEnv = process.env): Lookup {
  const project = projectOf(folder);
  if (project && dependencies(project.manifest).includes('typescript')) {
    const installed = packageFolder('typescript', project.root);
    const found = installed === undefined ? undefined : typeScriptAt(installed, 'project');
    return found ? { found } : { projectMissing: project.root };
  }
  const vscode = environment[VSCODE_TYPESCRIPT_VARIABLE];
  if (vscode) {
    const found = typeScriptAt(vscode, 'vscode');
    if (found) return { found };
  }
  for (const global of globalFolders()) {
    const found = typeScriptAt(path.join(global, 'typescript'), 'global');
    if (found) return { found };
  }
  const global = npmGlobalFolder();
  const found = global === undefined ? undefined : typeScriptAt(path.join(global, 'typescript'), 'global');
  return found ? { found } : { none: true };
}

/** A line for `ts --version` and for errors: the version and where it comes from. */
export function describe(install: TypeScriptInstall): string {
  const where = { project: 'of the project', vscode: 'of VS Code', global: 'global' }[install.source];
  return `TypeScript ${install.version} (${where}, ${install.folder})`;
}
