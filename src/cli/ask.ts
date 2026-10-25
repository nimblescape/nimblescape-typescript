// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The questions of ts in the terminal: whether to install the packages of a folder, and which TypeScript to install.
// ts asks only when both the input and the output are a terminal; otherwise it prints the command and stops, so that a
// script, a pipe or the feedback agent never waits for an answer.

import { readSync, writeSync } from 'node:fs';
import { isatty } from 'node:tty';

/** True when ts may ask: the input and the output are a terminal. */
export function canAsk(): boolean {
  return isatty(0) && isatty(1);
}

/** Reads one line of the input without the line break; null at the end of the input. */
export function readLine(): string | null {
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
      throw error;
    }
    if (count !== 1) break;
    if (buffer[0] === 10) return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\r$/, '');
    bytes.push(buffer[0]);
  }
  return bytes.length > 0 ? new TextDecoder().decode(new Uint8Array(bytes)) : null;
}

/** Asks a question with the answers yes and no; an empty answer is yes. */
export function askYesNo(question: string): boolean {
  writeSync(1, `${question} [Y/n] `);
  const answer = (readLine() ?? 'n').trim().toLowerCase();
  return answer === '' || answer === 'y' || answer === 'yes';
}

/** Asks a question and returns the answer, or `fallback` for an empty answer. */
export function askText(question: string, fallback: string): string {
  writeSync(1, `${question} [${fallback}] `);
  const answer = (readLine() ?? '').trim();
  return answer === '' ? fallback : answer;
}
