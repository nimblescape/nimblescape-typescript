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
// allowJs lets ts run a JavaScript file; checkJs stays off, as in tsc and Deno, so tsc checks the types of a JavaScript
// file only with the comment // @ts-check. This file imports only node:path, so both bundles can use it.
//
// A project with a tsconfig.json belongs to ts only when its compilerOptions.plugins names the editor plugin, as the
// tsconfig.json of ts init does (isTsProject). Every other tsconfig.json is a standard project, for example a Vite
// project: ts and the editor check it as tsc does, without the rules of ts.

import * as path from 'node:path';

/** The name of the editor plugin (plugin/package.json), which marks a project of ts in compilerOptions.plugins. */
export const PLUGIN_NAME = 'nimblescape-typescript-plugin';

/**
 * True when the setting `plugins` of a tsconfig.json names the editor plugin: the project belongs to ts, which gives
 * it the types of prompt(), alert() and confirm() and makes every file an ES module. ts init writes this entry.
 */
export function isTsProject(plugins: unknown): boolean {
  return Array.isArray(plugins) && plugins.some((entry) => typeof entry === 'object' && entry !== null && (entry as { name?: unknown }).name === PLUGIN_NAME);
}

/** The name of the type package of the polyfills prompt(), alert() and confirm() in the type folder (types/). */
export const GLOBALS_TYPES = 'nimblescape-globals';

/** The compiler options of a folder without tsconfig.json, as a tsconfig.json would write them. */
export const DEFAULT_COMPILER_OPTIONS = {
  module: 'nodenext',
  lib: ['esnext'],
  types: ['node', GLOBALS_TYPES],
  skipLibCheck: true,
  // ts runs a JavaScript file too, and a TypeScript file may import one.
  allowJs: true,
  // A relative import may end with .ts, as Node.js requires for a .ts file; tsc writes .js into the output.
  rewriteRelativeImportExtensions: true,
} as const;

/**
 * True when a program with the setting `lib` has the types of the browser (lib dom), which declare prompt(), alert()
 * and confirm() themselves; then ts and the plugin do not add the types of their polyfills. Without "lib", tsc takes
 * the full library of the target, which includes dom. A name comes as in a tsconfig.json ("dom") or as the file
 * ("lib.dom.d.ts").
 */
export function hasBrowserTypes(lib: readonly string[] | undefined): boolean {
  return lib === undefined || lib.some((name) => /^(lib\.)?dom(\.|$)/i.test(name));
}

/** True for the name of a JavaScript file: .js, .mjs, .cjs or .jsx. */
export function isJavaScriptFile(file: string): boolean {
  return /\.[cm]?jsx?$/i.test(file);
}

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
