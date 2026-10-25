// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// stopOnEntry of the debug type ts: the debugger pauses at the first statement of the program, as node --inspect-brk
// pauses (pauseOnStart.ts). ts loads this module before the program only in a debug session with stopOnEntry
// (NIMBLESCAPE_TS_DEBUG=stop-on-entry). The entry breakpoint of js-debug cannot do this: it lies at line 1, column 1
// of the compiled file, and V8 moves such a breakpoint to the first position where it can stop, which is inside the
// first function of the file when the file declares one before its first statement.
//
// - A CommonJS program: Node.js compiles a module as a function and calls it. For the main module, the source that
//   Node.js compiles puts the code of the module into an inner function, which the function of Node.js calls with
//   callAndPauseOnStart, as Node.js itself does with --inspect-brk. The pause comes at the first statement of the
//   module. The inner function has the parameters of the function of Node.js (exports, require, module, __filename,
//   __dirname), so the code of the module has the same variables in the same scope as without the pause. The inner
//   function starts on line 1, after "use strict"; when the file starts with it, as the output of tsc does, so every
//   line and column of the code stays where the source map of tsc expects it. Node.js still compiles, runs and maps
//   the module itself, so errors name the lines of the .ts file. The function of Node.js stays below the inner
//   function in the call stack; its place on line 1 has no place in the .ts file, so js-debug shows it as skipped.
// - An ES module: Node.js runs the imports of a module before the module, in the order of the import declarations. A
//   hook of the module loader appends the import of pause.mjs to the source of the main module, so pause.mjs runs
//   after the other imports and asks for the pause right before the module itself starts. Lines and columns of the
//   source stay as they are. The hook needs module.registerHooks() of Node.js 22.15 or later; an older Node.js runs an
//   ES module without the pause.
//
// esbuild bundles this file into dist/stop-on-entry.mjs, and pause.ts into dist/pause.mjs.

import * as fs from 'node:fs';
import Module from 'node:module';
import { pathToFileURL } from 'node:url';
import { callAndPauseOnStart } from './pauseOnStart.ts';

/** The global through which the main module of a CommonJS program reaches callAndPauseOnStart, once. */
const PAUSE_KEY = 'nimblescape.ts.pause';

type Compile = (this: unknown, content: string, filename: string, format?: string) => unknown;
interface LoadResult {
  format?: string | null;
  source?: string | ArrayBuffer | NodeJS.TypedArray | null;
}
type RegisterHooks = (hooks: {
  load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => LoadResult): LoadResult;
}) => { deregister(): void };

/** The parts of the module loader of Node.js that this module uses, which the types of Node.js do not name. */
const loader = Module as unknown as { prototype: { _compile: Compile }; registerHooks?: RegisterHooks };

/**
 * The source of a CommonJS module whose code runs in an inner function with the parameters of the function of
 * Node.js, which callAndPauseOnStart calls with the `this` and the arguments of the function of Node.js. The global
 * goes away before the code of the module runs.
 */
function pausingSource(content: string): string {
  const strict = /^(["'])use strict\1;/.exec(content)?.[0] ?? '';
  const key = `Symbol.for(${JSON.stringify(PAUSE_KEY)})`;
  return (
    `${strict}const __nimblescapeTsPause = globalThis[${key}]; delete globalThis[${key}]; ` +
    `return __nimblescapeTsPause(function (exports, require, module, __filename, __dirname) {` +
    `${content.slice(strict.length)}\n}, this, ...arguments);`
  );
}

/** Makes the main module `main` (a real path) pause at its first statement. */
function pauseAtStart(main: string): void {
  const mainUrl = pathToFileURL(main).href;
  const pauseUrl = new URL('pause.mjs', import.meta.url).href;
  const compile = loader.prototype._compile;
  let hooks: { deregister(): void } | undefined;
  // The loaders go back to normal once the main module has its pause.
  const done = () => {
    loader.prototype._compile = compile;
    hooks?.deregister();
  };

  loader.prototype._compile = function (content, filename, format) {
    if (filename !== main || format === 'module') return compile.call(this, content, filename, format);
    done();
    Object.defineProperty(globalThis, Symbol.for(PAUSE_KEY), { value: callAndPauseOnStart, configurable: true });
    return compile.call(this, pausingSource(content), filename, format);
  };

  hooks = loader.registerHooks?.({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (url !== mainUrl || result.format !== 'module' || result.source == null) return result;
      done();
      const source = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `${source}\nimport ${JSON.stringify(pauseUrl)};\n` };
    },
  });
}

// ts passes the compiled file as a real path, and Node.js names the main module by its real path.
if (process.argv[1] !== undefined) pauseAtStart(fs.realpathSync(process.argv[1]));
