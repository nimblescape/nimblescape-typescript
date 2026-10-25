// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The last import of the main module, when it is an ES module, in a debug session with stopOnEntry (stopOnEntry.ts).
// Node.js runs this module after the other imports of the main module; it asks the debugger to pause at the next
// JavaScript function that starts, which is the main module itself, and starts no function of its own after that.
// esbuild bundles this file into dist/pause.mjs.

import { callAndPauseOnStart } from './pauseOnStart.ts';

callAndPauseOnStart(Math.max, undefined);
