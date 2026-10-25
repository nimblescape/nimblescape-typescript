// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The pause of node --inspect-brk for stopOnEntry.ts and pause.ts. Node.js has no public interface for it: --inspect-brk
// calls callAndPauseOnStart(fn, thisArg, ...args) of its inspector binding, which asks the debugger to pause at the
// next JavaScript function that starts and then calls fn. When fn is a JavaScript function, the pause comes at its
// first statement; a function of the engine, as Math.max, runs no JavaScript, so the pause comes at the next function
// that the program starts. Node.js reaches the binding also through process.binding(), which prints a deprecation
// warning only with --pending-deprecation; this module hides that warning, because the program did not cause it.

type CallAndPauseOnStart = (fn: (...args: never[]) => unknown, thisArg: unknown, ...args: unknown[]) => unknown;

/** callAndPauseOnStart of the inspector binding of Node.js, itself: calling it starts no JavaScript function. */
export const callAndPauseOnStart: CallAndPauseOnStart = (() => {
  const quiet = process.noDeprecation;
  process.noDeprecation = true;
  try {
    const binding = (process as unknown as { binding(name: string): { callAndPauseOnStart: CallAndPauseOnStart } }).binding('inspector');
    return binding.callAndPauseOnStart;
  } finally {
    process.noDeprecation = quiet;
  }
})();
