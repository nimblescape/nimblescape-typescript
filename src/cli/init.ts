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

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as ts from 'typescript';
import { loadTypeScript } from './compile.ts';
import { readManifest, type TypeScriptInstall } from './typescript.ts';

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

/** Writes tsconfig.json into the current folder; returns the exit code for ts. */
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
  process.stdout.write(result.output);
  return 0;
}
