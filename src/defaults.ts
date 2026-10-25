// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The defaults of ts for a folder without tsconfig.json, shared by the command ts (src/cli) and the TypeScript server
// plugin (projectDefaults.ts), so that the editor and the command line report the same errors. They are the built-in
// defaults of tsc plus what a program needs that runs in Node.js: the types of Node.js instead of the browser, the
// module system of Node.js (nodenext), and skipLibCheck, as tsc --init writes it. Every file is an ES module, because
// ts and the plugin act as if the root of the file system had a package.json with "type": "module"
// (VIRTUAL_PACKAGE_JSON) when no folder above the file has a package.json. Everything else stays as tsc has it:
// verbatimModuleSyntax, isolatedModules and exactOptionalPropertyTypes are off, so a type needs no `import type`.
// This file imports only node:path, so both bundles can use it.

import * as path from 'node:path';

/** The name of the type package of the polyfills prompt(), alert() and confirm() in the type folder (types/). */
export const GLOBALS_TYPES = 'nimblescape-globals';

/** The compiler options of a folder without tsconfig.json, as a tsconfig.json would write them. */
export const DEFAULT_COMPILER_OPTIONS = {
  module: 'nodenext',
  lib: ['esnext'],
  types: ['node', GLOBALS_TYPES],
  skipLibCheck: true,
  // A relative import may end with .ts, as Node.js requires for a .ts file; tsc writes .js into the output.
  rewriteRelativeImportExtensions: true,
} as const;

/** The content of the package.json that ts and the plugin assume at the root of the file system. */
export const VIRTUAL_PACKAGE_JSON = '{"type":"module"}';

/** The path of the package.json at the root of the file system of `file`, for example `/package.json`. */
export function rootPackageJson(file: string): string {
  return path.join(path.parse(path.resolve(file)).root, 'package.json');
}

/** The nearest folder from `folder` upwards, the folder itself included, that holds `name`; undefined if none. */
export function findUp(folder: string, name: string, exists: (file: string) => boolean): string | undefined {
  for (let current = path.resolve(folder); ; current = path.dirname(current)) {
    if (exists(path.join(current, name))) return current;
    if (path.dirname(current) === current) return undefined;
  }
}
