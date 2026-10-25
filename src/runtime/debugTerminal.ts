// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A clean terminal for a program of a debug session of the debug type ts. ts loads this module before the program
// only in such a session (NIMBLESCAPE_TS_DEBUG, set by the extension). It clears the command line that VS Code types
// into the terminal and the messages "Debugger attached.", so the terminal shows only the output of the program. When
// the program ends, it closes the connection to the debugger, so Node.js does not print "Waiting for the debugger to
// disconnect...". esbuild bundles this file into dist/debug-terminal.mjs.

import * as inspector from 'node:inspector';

if (process.stdout.isTTY) {
  // The same as the command clear: cursor home, clear the screen and the scrollback.
  process.stdout.write('\x1b[H\x1b[2J\x1b[3J');
}

process.on('exit', () => {
  if (inspector.url() !== undefined) inspector.close();
});
