// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The questions of ts in the terminal: whether to install the packages of a folder, and which TypeScript to install.
// ts asks only when both the input and the output are a terminal; otherwise it prints the command and stops, so that a
// script, a pipe or the feedback agent never waits for an answer. The TypeScript comes from a list that the user moves
// through with the arrow keys: the terminal is in raw mode for it, so every key press arrives at once and without an
// echo.

import { readSync, writeSync } from 'node:fs';
import { isatty, type ReadStream } from 'node:tty';

/** True when ts may ask: the input and the output are a terminal. */
export function canAsk(): boolean {
  return isatty(0) && isatty(1);
}

/** Reads from the input into `buffer`; returns the number of bytes, 0 at the end of the input. */
function readInput(buffer: Uint8Array): number {
  for (;;) {
    try {
      return readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      // The input is not ready yet (a terminal in non-blocking mode): wait 20 ms and read again.
      if ((error as NodeJS.ErrnoException).code === 'EAGAIN') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        continue;
      }
      throw error;
    }
  }
}

/** Reads one line of the input without the line break; null at the end of the input. */
export function readLine(): string | null {
  const bytes: number[] = [];
  const buffer = new Uint8Array(1);
  for (;;) {
    if (readInput(buffer) !== 1) break;
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

/** What a key does in a list: move up or down, choose the selected entry, or cancel the question. */
export type ListKey = 'up' | 'down' | 'choose' | 'cancel';

/**
 * The keys in the input of a terminal in raw mode, in their order: the arrow keys up and down (`ESC [ A` or, in the
 * mode of the cursor keys, `ESC O A`), Enter, and Esc, Ctrl+C or Ctrl+D to cancel. One read can hold several keys, for
 * example after fast typing. Other keys, also other escape sequences such as Home or Ctrl+Up, do nothing.
 */
export function listKeys(input: string): ListKey[] {
  const keys: ListKey[] = [];
  for (let i = 0; i < input.length; i++) {
    const sequence = /^\x1b(\[[0-9;]*[ -/]*[@-~]|O[@-~])/.exec(input.slice(i));
    if (sequence) {
      if (sequence[1] === '[A' || sequence[1] === 'OA') keys.push('up');
      if (sequence[1] === '[B' || sequence[1] === 'OB') keys.push('down');
      i += sequence[0].length - 1;
    } else if (input[i] === '\r' || input[i] === '\n') keys.push('choose');
    else if (input[i] === '\x1b' || input[i] === '\x03' || input[i] === '\x04') keys.push('cancel');
  }
  return keys;
}

/** The selected entry of a list and the first entry that the window of the list shows. */
export interface ListState {
  readonly selected: number;
  readonly top: number;
}

/** The state after an arrow key: the selection stops at the ends, and the window follows it. */
export function moveInList(state: ListState, key: 'up' | 'down', count: number, height: number): ListState {
  const selected = Math.min(Math.max(state.selected + (key === 'up' ? -1 : 1), 0), count - 1);
  const top = Math.min(Math.max(state.top, selected - height + 1), selected);
  return { selected, top };
}

/** The first entry of a window of `height` entries that shows `selected` in the middle, when the list is long enough. */
export function windowTop(selected: number, count: number, height: number): number {
  return Math.min(Math.max(selected - Math.floor(height / 2), 0), Math.max(count - height, 0));
}

/** Cyan, the color of the selected entry, and the default color again. */
const SELECTED_COLOR = ['\x1b[36m', '\x1b[39m'];

/**
 * The lines of the list: the entries of the window, each cut to `width` characters, the selected one marked with ❯
 * and, with `color`, in cyan.
 */
export function listLines(labels: readonly string[], state: ListState, height: number, width: number, color = false): string[] {
  return labels.slice(state.top, state.top + height).map((label, i) => {
    if (state.top + i !== state.selected) return `  ${label}`.slice(0, width);
    const line = `❯ ${label}`.slice(0, width);
    return color ? `${SELECTED_COLOR[0]}${line}${SELECTED_COLOR[1]}` : line;
  });
}

/** The number of entries that a list shows at once; a longer list scrolls. */
const LIST_HEIGHT = 10;

/** The line under a list: the keys, and in a list that scrolls, the position of the selected entry. */
export function keysLine(state: ListState, count: number, height: number): string {
  return `  ↑ ↓ select, Enter confirms, Esc cancels${count > height ? ` (${state.selected + 1} of ${count})` : ''}`;
}

/**
 * Asks `question` with a list of `labels`, of which `initial` is selected first; the user selects with the arrow keys
 * and confirms with Enter. Returns the index of the chosen entry, or undefined after Esc, Ctrl+C or Ctrl+D. Afterwards
 * the list is gone and the question line shows the answer. The selected entry is cyan, unless the variable NO_COLOR
 * is set (https://no-color.org). Needs a terminal (canAsk).
 */
export function askChoice(question: string, labels: readonly string[], initial: number): number | undefined {
  const stdin = process.stdin as ReadStream;
  const columns = process.stdout.columns || 80;
  // One character less than the width of the terminal, so that no line wraps and the lines can be counted.
  const width = Math.max(columns - 1, 10);
  const height = Math.min(labels.length, LIST_HEIGHT);
  const color = !process.env.NO_COLOR;
  const questionRows = Math.max(Math.ceil(question.length / columns), 1);
  let state: ListState = { selected: initial, top: windowTop(initial, labels.length, height) };
  const draw = (): void => {
    const hint = keysLine(state, labels.length, height).slice(0, width);
    writeSync(1, `${[...listLines(labels, state, height, width, color), hint].join('\n')}\n`);
  };
  // Back to the start of the list (up by its lines and the line of the keys), and everything below it deleted.
  const erase = (rows: number): void => {
    writeSync(1, `\x1b[${rows}A\r\x1b[J`);
  };
  writeSync(1, `${question}\n\x1b[?25l`);
  draw();
  stdin.setRawMode(true);
  const buffer = new Uint8Array(64);
  let answer: number | undefined;
  try {
    reading: for (;;) {
      const count = readInput(buffer);
      const keys: ListKey[] = count === 0 ? ['cancel'] : listKeys(new TextDecoder().decode(buffer.subarray(0, count)));
      for (const key of keys) {
        if (key === 'choose') answer = state.selected;
        if (key === 'choose' || key === 'cancel') break reading;
        state = moveInList(state, key, labels.length, height);
      }
      erase(height + 1);
      draw();
    }
  } finally {
    stdin.setRawMode(false);
    erase(height + 1 + questionRows);
    writeSync(1, `${question} ${answer === undefined ? '(cancelled)' : labels[answer]}\n\x1b[?25h`);
  }
  return answer;
}
