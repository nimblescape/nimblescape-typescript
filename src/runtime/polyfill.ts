// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The polyfills of ts: prompt(), alert() and confirm() as global functions, as Deno and the browser have them and
// Node.js does not. ts loads this module before the program (node --import), so a program uses them without an
// import. They read from the keyboard and wait, like Deno in a terminal: the program stops until the user presses
// Enter. Input from a file or a pipe works too (for example the input of a test), and its lines appear on the screen,
// as a terminal would show them. The types are in types/nimblescape-globals/index.d.ts. esbuild bundles this file
// into dist/polyfill.mjs.

import { readSync, writeSync } from 'node:fs';
import { isatty } from 'node:tty';

/** Reads one line of the input without the line break; null at the end of the input. */
function readLine(): string | null {
  const bytes: number[] = [];
  const buffer = new Uint8Array(1);
  for (;;) {
    let count: number;
    try {
      count = readSync(0, buffer, 0, 1, null);
    } catch (error) {
      // The input is not ready yet (a terminal in non-blocking mode): wait 20 ms and read again.
      if ((error as NodeJS.ErrnoException).code === 'EAGAIN') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        continue;
      }
      // No input at all, for example a closed input.
      if ((error as NodeJS.ErrnoException).code === 'EOF') break;
      throw error;
    }
    if (count !== 1) break;
    if (buffer[0] === 10) return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\r$/, '');
    bytes.push(buffer[0]);
  }
  return bytes.length > 0 ? new TextDecoder().decode(new Uint8Array(bytes)) : null;
}

/** Shows `text`, reads one line and shows the line when it does not come from a terminal. */
function ask(text: string): string | null {
  writeSync(1, text);
  const line = readLine();
  if (!isatty(0)) writeSync(1, `${line ?? ''}\n`);
  return line;
}

/**
 * Shows `message`, waits for one line and returns it without the line break. An empty line returns `defaultValue`
 * when there is one; the end of the input (Ctrl+D) returns null.
 */
function prompt(message = 'Prompt', defaultValue?: string): string | null {
  const line = ask(defaultValue === undefined ? `${message} ` : `${message} [${defaultValue}] `);
  if (line === '' && defaultValue !== undefined) return defaultValue;
  return line;
}

/** Shows `message` and waits until the user presses Enter. */
function alert(message = 'Alert'): void {
  ask(`${message} [Enter] `);
}

/** Shows `message` and returns true when the user answers y or Y. */
function confirm(message = 'Confirm'): boolean {
  const answer = ask(`${message} [y/N] `);
  return answer === 'y' || answer === 'Y';
}

const globals = globalThis as Record<string, unknown>;
for (const [name, value] of Object.entries({ prompt, alert, confirm })) {
  if (globals[name] === undefined) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: false });
  }
}
