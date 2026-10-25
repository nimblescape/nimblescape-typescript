// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The types of the polyfills of ts (src/runtime/polyfill.ts): prompt(), alert() and confirm() are global functions in
// every program that ts runs, as in Deno and the browser. Without a tsconfig.json, ts and the editor plugin add this
// type package ("types": ["node", "nimblescape-globals"]); with a tsconfig.json, they add this file to the files of
// the project, unless the project has the types of the browser (lib dom), which declare the three functions.

/**
 * Shows `message`, waits for one line of the keyboard and returns it without the line break. An empty line returns
 * `defaultValue` when there is one; the end of the input (Ctrl+D) returns null.
 */
declare function prompt(message?: string, defaultValue?: string): string | null;

/** Shows `message` and waits until the user presses Enter. */
declare function alert(message?: string): void;

/** Shows `message` and returns true when the user answers y or Y. */
declare function confirm(message?: string): boolean;
