// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// `ts --init [--browser]`: writes the tsconfig.json of `tsc --init` with two changes (README, "Settings"):
//
// - The lines for Node.js that tsc --init writes as comments are settings: lib esnext and the types of Node.js. With
//   --browser, lib is esnext and dom, and types stays empty, so no types of Node.js reach browser code.
// - noUncheckedIndexedAccess goes, so that the counting loop `sum += marks[i]` works, and declaration, declarationMap
//   and jsx go, because ts builds no libraries and no JSX.
//
// ts takes the text from the TypeScript that it uses: TypeScript 6 writes it into a System that keeps it in memory,
// TypeScript 7 into a temporary folder. So the file follows the TypeScript of VS Code. tsc --init refuses to replace
// an existing tsconfig.json, and so does ts.
//
// A project with a tsconfig.json gets exactly its settings, as with tsc, so for Node.js ts --init also prepares what
// the settings need: globals.d.ts with the types of prompt(), alert() and confirm() (the polyfills of ts), which tsc
// and the editor take from the folder, and the types of Node.js (npm install --save-dev @types/node, after a
// question) when the folder cannot find them. The browser has the three functions in lib dom and needs neither.
// Without a package.json in the folder or above, ts --init also writes a package.json with "type": "module": with
// module nodenext, a file without one is CommonJS for tsc, and its imports are error TS1295 under
// verbatimModuleSyntax; without a tsconfig.json, ts makes every file an ES module in the same way.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as ts from 'typescript';
import { findUp, GLOBALS_TYPES } from '../defaults.ts';
import { askYesNo, canAsk } from './ask.ts';
import { loadTypeScript, packageRoot } from './compile.ts';
import { packageFolder, readManifest, type TypeScriptInstall } from './typescript.ts';

/** The file with the types of prompt(), alert() and confirm() that ts --init writes next to tsconfig.json. */
export const GLOBALS_FILE = 'globals.d.ts';

/** The command that installs the types of Node.js, as the comment of tsc --init names it. */
export const NODE_TYPES_COMMAND = ['npm', 'install', '--save-dev', '@types/node'] as const;

/** The tsconfig.json of `tsc --init` of the TypeScript of `install`, and the messages of tsc. */
function tscInit(install: TypeScriptInstall): { text: string; output: string; code: number } {
  const typescript = loadTypeScript(install);
  if (!typescript) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-init-'));
    try {
      const manifest = readManifest(install.folder) as { bin?: Record<string, string> } | undefined;
      const bin = path.join(install.folder, manifest?.bin?.tsc ?? 'bin/tsc');
      const result = spawnSync(process.execPath, [bin, '--init'], { cwd: folder, encoding: 'utf8' });
      const file = path.join(folder, 'tsconfig.json');
      return { text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', output: result.stdout, code: result.status ?? 1 };
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
  let text = '';
  let output = '';
  let code = 0;
  const target = path.join(process.cwd(), 'tsconfig.json');
  const system: ts.System = {
    ...typescript.sys,
    writeFile: (name, data) => {
      if (path.resolve(name) === target) text = data;
      else typescript.sys.writeFile(name, data);
    },
    write: (data) => void (output += data),
    exit: (status) => void (code = status ?? 0),
  };
  typescript.executeCommandLine(system, () => {}, ['--init']);
  return { text, output, code };
}

/** The changes of ts to the tsconfig.json of tsc --init (see the head of this file). */
export function adapt(text: string, browser: boolean): string {
  const lines = text.split('\n');
  const removed = /^\s*"(noUncheckedIndexedAccess|declaration|declarationMap|jsx)":/;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (removed.test(line)) continue;
    // The block of tsc for Node.js: "// For nodejs:" and the commented lines of lib and types.
    if (/^\s*\/\/ For nodejs:/.test(line)) {
      const indent = /^\s*/.exec(line)?.[0] ?? '';
      // The settings of tsc --init for these lines replace its line "types": [] above.
      for (let j = out.length - 1; j >= 0; j--) {
        if (/^\s*"types":\s*\[\],?\s*$/.test(out[j])) {
          out.splice(j, 1);
          break;
        }
      }
      if (browser) {
        out.push(`${indent}// For the browser (ts --init --browser):`, `${indent}"lib": ["esnext", "dom"],`, `${indent}"types": [],`);
      } else {
        out.push(`${indent}// For Node.js (ts --init), with npm install -D @types/node:`, `${indent}"lib": ["esnext"],`, `${indent}"types": ["node"],`);
      }
      // Skips the commented lines of the block up to its end.
      while (i + 1 < lines.length && /^\s*\/\/ ("lib"|"types"|and npm install)/.test(lines[i + 1])) i++;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** The text of globals.d.ts: the declarations of the type folder of ts (types/nimblescape-globals), with its own head. */
export function globalsText(environment: NodeJS.ProcessEnv = process.env): string {
  const source = fs.readFileSync(path.join(packageRoot(environment), 'types', GLOBALS_TYPES, 'index.d.ts'), 'utf8');
  const head = [
    '// The global functions of ts: prompt(), alert() and confirm() are part of every program that ts runs, as in Deno',
    '// and the browser. A project with a tsconfig.json declares them itself; ts --init wrote this file.',
  ];
  return `${head.join('\n')}\n\n${source.slice(source.indexOf('/**'))}`;
}

/** Writes globals.d.ts into the current folder unless it exists; returns the line for the output. */
function writeGlobals(): string {
  const target = path.join(process.cwd(), GLOBALS_FILE);
  if (fs.existsSync(target)) return `${GLOBALS_FILE} exists already and stays as it is`;
  fs.writeFileSync(target, globalsText());
  return `Created a new ${GLOBALS_FILE} with the types of prompt(), alert() and confirm()`;
}

/** Writes a package.json with "type": "module" unless the folder or a folder above has one; returns the line for the output. */
function writePackageJson(): string | undefined {
  if (findUp(process.cwd(), 'package.json', fs.existsSync) !== undefined) return undefined;
  fs.writeFileSync(path.join(process.cwd(), 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
  return 'Created a new package.json with "type": "module", so every file is an ES module';
}

/** Installs the types of Node.js after a question when the current folder cannot find them; returns the exit code. */
function ensureNodeTypes(): number {
  if (packageFolder('@types/node', process.cwd()) !== undefined) return 0;
  const command = NODE_TYPES_COMMAND.join(' ');
  if (!canAsk()) {
    console.log(`The types of Node.js (@types/node) are not installed. Run ${command} in this folder.`);
    return 0;
  }
  console.log('The types of Node.js (@types/node) are not installed.');
  if (!askYesNo(`Run ${command} now?`)) return 0;
  console.log(`> ${command}`);
  const [npm, ...args] = NODE_TYPES_COMMAND;
  return spawnSync(npm, args, { stdio: 'inherit' }).status ?? 1;
}

/** Writes tsconfig.json into the current folder (for Node.js also globals.d.ts); returns the exit code for ts. */
export function init(install: TypeScriptInstall, browser: boolean): number {
  const target = path.join(process.cwd(), 'tsconfig.json');
  if (fs.existsSync(target)) {
    console.error(`error TS5054: A 'tsconfig.json' file is already defined at: '${target}'.`);
    return 1;
  }
  const result = tscInit(install);
  if (result.code !== 0 || !result.text) {
    process.stdout.write(result.output);
    return result.code || 1;
  }
  fs.writeFileSync(target, adapt(result.text, browser));
  const lines = [browser ? undefined : writeGlobals(), writePackageJson()].filter((line) => line !== undefined);
  // The lines of ts follow the line of tsc "Created a new tsconfig.json".
  const created = /^.*Created a new tsconfig\.json.*$/m;
  const text = lines.join('\n');
  if (lines.length === 0) process.stdout.write(result.output);
  else process.stdout.write(created.test(result.output) ? result.output.replace(created, (line) => `${line}\n${text}`) : `${result.output}${text}\n`);
  return browser ? 0 : ensureNodeTypes();
}
