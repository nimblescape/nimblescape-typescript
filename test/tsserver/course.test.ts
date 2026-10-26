// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The plugin in the TypeScript server of a course (npm run test:tsserver): the TypeScript server of the examples,
// TypeScript 6.0.3 as in the courses, with the packages of a course (@types/node, es-toolkit, @majikmate/ts-utils) and
// their rules (examples/tsconfig.json). The server starts as the TypeScript extension of VS Code starts it, once
// without the plugin, so that the test sees what TypeScript offers, and with the plugin from two folders: the folder of
// this repository, where npm links node_modules/nimblescape-typescript-plugin to plugin/, and a folder with the layout
// of the package, where that folder is a copy, as in the VSIX.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedTsserver, PLUGIN, TsServer, type CompletionEntry } from './tsserver.ts';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const examples = path.join(repository, 'examples');
const tsserver = path.join(examples, 'node_modules/typescript/lib/tsserver.js');
// The file of the requests; .gitignore keeps examples/*-test.ts out of Git.
const file = path.join(examples, 'completion-test.ts');

/** The names that a student types, and what the completion offers with an import for each of them. */
// prompt is a global of ts, also in a project with tsconfig.json, so the plugin hides prompt of @majikmate/ts-utils.
const HIDDEN = ['log', 'warn', 'exit', 'argv', 'env', 'parseInt', 'escape', 'prompt'];
const KEPT: Record<string, string[]> = {
  Dog: ['./dog.ts'],
  round: ['es-toolkit'],
  randomInt: ['es-toolkit', 'node:crypto'],
  existsSync: ['node:fs'],
  readFileSync: ['node:fs'],
  on: ['node:events'],
  once: ['node:events', 'es-toolkit'],
};

/** The modules of the auto-imports of `name`. */
function sources(entries: readonly CompletionEntry[], name: string): string[] {
  return entries.filter((entry) => entry.name === name && entry.source !== undefined).map((entry) => entry.source!);
}

/**
 * A folder with the layout of the package: the bundle in dist/, the type folder of ts in cli/types/ and a copy of the
 * plugin package in node_modules/.
 */
function packageLayout(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-package-'));
  fs.mkdirSync(path.join(folder, 'dist'));
  fs.copyFileSync(path.join(repository, 'dist/plugin.js'), path.join(folder, 'dist/plugin.js'));
  fs.cpSync(path.join(repository, 'cli/types'), path.join(folder, 'cli/types'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'node_modules', PLUGIN), { recursive: true });
  fs.copyFileSync(path.join(repository, 'plugin/package.json'), path.join(folder, 'node_modules', PLUGIN, 'package.json'));
  return folder;
}

/** The completions of each name in the TypeScript server, started with the plugin from `extensionFolder`. */
async function completions(extensionFolder: string | undefined, names: string[]): Promise<{ entries: Map<string, readonly CompletionEntry[]>; log: string }> {
  const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-log-')), 'tsserver.log');
  // examples/tsconfig.json names the plugin, so a server without the plugin needs a TypeScript outside the repository.
  const server = extensionFolder ? new TsServer(tsserver, logFile, extensionFolder) : new TsServer(isolatedTsserver(tsserver, plain), logFile);
  try {
    await server.configure();
    const entries = new Map<string, readonly CompletionEntry[]>();
    for (const name of names) {
      const text = `const greeting = 'Hello';\n${name}`;
      fs.writeFileSync(file, text);
      entries.set(name, await server.complete(file, text));
    }
    return { entries, log: fs.readFileSync(logFile, 'utf8') };
  } finally {
    server.close();
    fs.rmSync(file, { force: true });
  }
}

const NAMES = [...HIDDEN, ...Object.keys(KEPT)];
let layout: string;
let plain: string;

beforeAll(() => {
  expect(fs.existsSync(tsserver), `${tsserver} is missing: run npm ci --ignore-scripts --prefix examples`).toBe(true);
  expect(fs.existsSync(path.join(repository, 'dist/plugin.js')), 'dist/plugin.js is missing: run npm run build').toBe(true);
  layout = packageLayout();
  plain = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-plain-'));
});

afterAll(() => {
  fs.rmSync(layout, { recursive: true, force: true });
  fs.rmSync(plain, { recursive: true, force: true });
});

describe('TypeScript 6.0.3 without the plugin', () => {
  it('offers the auto-imports that the plugin hides', async () => {
    const { entries } = await completions(undefined, HIDDEN);
    for (const name of HIDDEN) expect(sources(entries.get(name)!, name), name).not.toEqual([]);
    expect(sources(entries.get('log')!, 'log')).toContain('node:console');
    expect(sources(entries.get('exit')!, 'exit')).toContain('node:process');
    expect(sources(entries.get('parseInt')!, 'parseInt')).toContain('es-toolkit/compat');
  });
});

describe.each([
  ['the folder of the repository', () => repository],
  ['the layout of the package', () => layout],
])('TypeScript 6.0.3 with the plugin from %s', (_title, folder) => {
  let result: Awaited<ReturnType<typeof completions>>;

  beforeAll(async () => {
    result = await completions(folder(), NAMES);
  });

  it('loads the plugin', () => {
    expect(result.log).toContain(`${PLUGIN}: filters the auto-import completions of ${path.join(examples, 'tsconfig.json')} with TypeScript 6.0.3`);
  });

  it('hides the auto-imports of globals and of the modules that export a global', () => {
    for (const name of HIDDEN) expect(sources(result.entries.get(name)!, name), name).toEqual([]);
    // The globals stay.
    for (const name of ['parseInt', 'escape']) expect(result.entries.get(name)!.some((entry) => entry.name === name && !entry.source), name).toBe(true);
  });

  it('keeps the auto-imports that a program needs', () => {
    for (const [name, modules] of Object.entries(KEPT)) {
      expect(sources(result.entries.get(name)!, name), name).toEqual(expect.arrayContaining(modules));
    }
    // on and once of node:process are members of the global process.
    expect(sources(result.entries.get('on')!, 'on')).not.toContain('node:process');
    expect(sources(result.entries.get('once')!, 'once')).not.toContain('node:process');
  });
});
