// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The defaults of ts and rule 3 in the TypeScript server (npm run test:tsserver), with TypeScript 6.0.3 of the
// examples and the plugin of this repository, whose type folder is cli/ (npm ci --prefix cli). Two courses in the
// temporary folder of the system, each a repository (.git) with two assignments that both have a car.ts:
//
// - "loose" has no tsconfig.json and no package.json, as the courses: the files are in an inferred project, which
//   gets the options that VS Code sends, and the plugin replaces them with the defaults of ts.
// - "configured" has one tsconfig.json at the root for every file, as the old courses: one configured project.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type ts from 'typescript';
import { TsServer, type CompletionEntry } from './tsserver.ts';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsserver = path.join(repository, 'examples/node_modules/typescript/lib/tsserver.js');

const CAR = 'export class Car {\n  drive(): string {\n    return "Brumm";\n  }\n}\n';
const CHECK = [
  'import { Car } from "./car";',
  'import { readFileSync } from "node:fs";',
  'document.title = "x";',
  'const name: string | null = prompt("Name?");',
  'interface P { nick?: string }',
  'const p: P = { nick: undefined };',
  'console.log(process.argv, name, p, readFileSync, Car);',
  '',
].join('\n');

let root: string;

/** A course with two assignments; `files` adds files. */
function course(name: string, files: Record<string, string> = {}): string {
  const folder = path.join(root, name);
  const all: Record<string, string> = {
    '.git/HEAD': 'ref: refs/heads/main\n',
    '20-assignments/09.01-cars/workspace/car.ts': CAR,
    '20-assignments/09.01-cars/workspace/main.ts': 'const car = new Car();\n',
    '20-assignments/09.01-cars/workspace/check.ts': CHECK,
    '20-assignments/09.02-garage/workspace/car.ts': CAR,
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    fs.writeFileSync(path.join(folder, file), text);
  }
  return folder;
}

/** A TypeScript server as VS Code starts it, with or without the plugin. */
async function server(withPlugin: boolean): Promise<TsServer> {
  const log = path.join(root, `tsserver-${withPlugin}-${Math.random().toString(16).slice(2)}.log`);
  const started = new TsServer(tsserver, log, withPlugin ? repository : undefined);
  await started.configure();
  await started.configureInferredProjects();
  return started;
}

const sources = (entries: readonly CompletionEntry[], name: string) =>
  entries.filter((entry) => entry.name === name && entry.source !== undefined).map((entry) => entry.source!);

let loose: string;
let configured: string;

beforeAll(() => {
  expect(fs.existsSync(tsserver), `${tsserver} is missing: run npm ci --ignore-scripts --prefix examples`).toBe(true);
  expect(fs.existsSync(path.join(repository, 'cli/node_modules/@types/node')), 'run npm ci --ignore-scripts --prefix cli').toBe(true);
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-defaults-')));
  loose = course('loose');
  configured = course('configured', { 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true, noEmit: true } }) });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a folder without tsconfig.json and package.json', () => {
  it('shows the errors of ts: no browser types, Node.js types, prompt(), imports with the extension', async () => {
    const tsServer = await server(true);
    try {
      const file = path.join(loose, '20-assignments/09.01-cars/workspace/check.ts');
      await tsServer.open(file, loose);
      // TS2835: "./car" needs the extension; TS2584: document is no name of Node.js.
      expect(await tsServer.errorCodes(file)).toEqual([2584, 2835]);
    } finally {
      tsServer.close();
    }
  });

  it('shows other errors without the plugin, with the options of VS Code', async () => {
    const tsServer = await server(false);
    try {
      const file = path.join(loose, '20-assignments/09.01-cars/workspace/check.ts');
      await tsServer.open(file, loose);
      expect(await tsServer.errorCodes(file)).not.toEqual([2584, 2835]);
    } finally {
      tsServer.close();
    }
  });

  it('offers the auto-import of a file of the assignment that is not open, with the extension .ts', async () => {
    const tsServer = await server(true);
    try {
      const file = path.join(loose, '20-assignments/09.01-cars/workspace/main.ts');
      await tsServer.open(file, loose);
      expect(sources(await tsServer.completionsAt(file, 1, 18), 'Car')).toEqual(['./car.ts']);
    } finally {
      tsServer.close();
    }
  });
});

describe('a folder without tsconfig.json with JavaScript files', () => {
  const PAGE = 'document.\n';
  const members = async (tsServer: TsServer, file: string) => (await tsServer.completionsAt(file, 1, 10)).map((entry) => entry.name);

  it('keeps the options of VS Code with the types of the browser when only JavaScript files are open', async () => {
    const folder = course('web', { '30-playground/page/main.js': PAGE });
    const file = path.join(folder, '30-playground/page/main.js');
    const tsServer = await server(true);
    try {
      await tsServer.open(file, folder);
      expect(await members(tsServer, file)).toContain('querySelector');
    } finally {
      tsServer.close();
    }
  });

  it('gives the defaults of ts while a TypeScript file is open, and the options of VS Code again after it closes', async () => {
    const folder = course('mixed', { '30-playground/page/main.js': PAGE });
    const page = path.join(folder, '30-playground/page/main.js');
    const check = path.join(folder, '20-assignments/09.01-cars/workspace/check.ts');
    const tsServer = await server(true);
    try {
      await tsServer.open(page, folder);
      expect(await members(tsServer, page)).toContain('querySelector');
      // VS Code puts both files into one project: the TypeScript file brings the options of ts, without the browser.
      await tsServer.open(check, folder);
      expect(await tsServer.errorCodes(check)).toEqual([2584, 2835]);
      expect(await members(tsServer, page)).not.toContain('querySelector');
      await tsServer.closeFile(check);
      expect(await members(tsServer, page)).toContain('querySelector');
    } finally {
      tsServer.close();
    }
  });

  it('offers the imports of a package whose names are globals while only JavaScript files are open', async () => {
    // A package like lucide-react, whose icons Map and Image have the names of globals: rule 1 of the filter would
    // hide their imports, so the filter waits for a TypeScript file, as the defaults of ts do.
    const icons = 'export declare const Star: string;\nexport declare const Map: string;\nexport declare const Image: string;\n';
    const folder = course('icons', {
      '30-playground/page/main.js': 'import { Star } from "icons";\nconsole.log(Star);\nMap',
      'node_modules/icons/package.json': JSON.stringify({ name: 'icons', version: '1.0.0', type: 'module', types: 'index.d.ts' }),
      'node_modules/icons/index.d.ts': icons,
    });
    const page = path.join(folder, '30-playground/page/main.js');
    const check = path.join(folder, '20-assignments/09.01-cars/workspace/check.ts');
    const tsServer = await server(true);
    try {
      await tsServer.open(page, folder);
      expect(sources(await tsServer.completionsAt(page, 3, 4), 'Map')).toEqual(['icons']);
      await tsServer.open(check, folder);
      expect(sources(await tsServer.completionsAt(page, 3, 4), 'Map')).toEqual([]);
      await tsServer.closeFile(check);
      expect(sources(await tsServer.completionsAt(page, 3, 4), 'Map')).toEqual(['icons']);
    } finally {
      tsServer.close();
    }
  });
});

describe('a folder with tsconfig.json', () => {
  const ASK = 'const answer: string | null = prompt("Name?");\nif (confirm("Greet?")) alert(`Hello ${answer}`);\n';

  it('knows prompt(), alert() and confirm() without lib dom, and every file is an ES module, as in ts', async () => {
    const folder = course('node-config', {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'nodenext', lib: ['esnext'], types: [], strict: true, verbatimModuleSyntax: true, rewriteRelativeImportExtensions: true, noEmit: true },
      }),
      '20-assignments/09.01-cars/workspace/ask.ts': `import { Car } from "./car.ts";\n${ASK}export const car = new Car();\n`,
    });
    const file = path.join(folder, '20-assignments/09.01-cars/workspace/ask.ts');
    const plain = await server(false);
    try {
      await plain.open(file, folder);
      // TS1287 and TS1295: an export and an import in a CommonJS file under verbatimModuleSyntax; TS2304: Cannot
      // find name, for each of the three functions.
      expect(await plain.errorCodes(file)).toEqual([1287, 1295, 2304, 2304, 2304]);
    } finally {
      plain.close();
    }
    const tsServer = await server(true);
    try {
      await tsServer.open(file, folder);
      expect(await tsServer.errorCodes(file)).toEqual([]);
    } finally {
      tsServer.close();
    }
  });

  it('leaves the three functions to lib dom in a project for the browser', async () => {
    const folder = course('browser-config', {
      'tsconfig.json': JSON.stringify({ compilerOptions: { lib: ['esnext', 'dom'], types: [], strict: true, noEmit: true } }),
      '20-assignments/09.01-cars/workspace/ask.ts': ASK,
    });
    const file = path.join(folder, '20-assignments/09.01-cars/workspace/ask.ts');
    const tsServer = await server(true);
    try {
      await tsServer.open(file, folder);
      expect(await tsServer.errorCodes(file)).toEqual([]);
      // Only the declaration of lib dom: the plugin adds no second one.
      const definitions = await tsServer.request<ts.server.protocol.DefinitionResponse>('definition', { file, line: 1, offset: 32 });
      expect((definitions.body ?? []).map((definition) => path.basename(definition.file))).toEqual(['lib.dom.d.ts']);
    } finally {
      tsServer.close();
    }
  });
});

describe('rule 3 in a project with every assignment', () => {
  it('offers the auto-import and the quick fix of the own assignment only', async () => {
    const file = path.join(configured, '20-assignments/09.01-cars/workspace/main.ts');
    const plain = await server(false);
    try {
      await plain.open(file, configured);
      expect(sources(await plain.completionsAt(file, 1, 18), 'Car').length, 'TypeScript offers both cars').toBe(2);
    } finally {
      plain.close();
    }
    const tsServer = await server(true);
    try {
      await tsServer.open(file, configured);
      // Without a package.json, every file is an ES module, which needs the extension. The tsconfig.json of the old
      // courses has no allowImportingTsExtensions here, so TypeScript writes "./car.js".
      expect(sources(await tsServer.completionsAt(file, 1, 18), 'Car')).toEqual(['./car.js']);
      const fixes = await tsServer.fixes(file, 1, 17, 20, 2304);
      expect(fixes.filter((fix) => fix.includes('car'))).toEqual(['Add import from "./car.js"']);
    } finally {
      tsServer.close();
    }
  });
});
