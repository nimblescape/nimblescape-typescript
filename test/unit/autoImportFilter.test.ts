// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The rules of the filter (src/autoImportFilter.ts) with a language service of TypeScript 6.0.3, the TypeScript of the
// development tools, over a small project in a temporary folder. Its declarations copy the forms of @types/node: a
// module that exports a global with `export =` (node:process), a module that exports a variable of its own with the
// name of a global (node:console), a module that exports a class of its own (node:events), and modules with named
// exports. Each test first checks that TypeScript offers the entry, so that the filter, and not TypeScript, removes it.
// The tests with the real packages of a course are in test/tsserver/.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterAutoImports, isAutoImport } from '../../src/autoImportFilter.ts';

const GLOBALS = `
declare var console: { log(...data: unknown[]): void; warn(...data: unknown[]): void };
declare var process: { exit(code?: number): never; argv: string[]; env: Record<string, string>; on(event: string): unknown };
interface Pet {
  name: string;
}
interface Animal {
  legs: number;
}
declare module 'node:console' {
  var console: { log(...data: unknown[]): void; warn(...data: unknown[]): void };
  export = console;
}
declare module 'node:process' {
  export = process;
}
declare module 'node:events' {
  class EventEmitter {
    static on(emitter: EventEmitter, event: string): unknown;
    static once(emitter: EventEmitter, event: string): unknown;
  }
  export = EventEmitter;
}
declare module 'node:crypto' {
  export function randomInt(max: number): number;
}
declare module 'node:querystring' {
  export function escape(text: string): string;
}
`;

const TOOLS = `
export declare function round(value: number): number;
export declare function parseInt(text: string): number;
export declare function escape(text: string): string;
export interface Pet {
  owner: string;
}
export declare class Animal {}
`;

let folder: string;
let service: ts.LanguageService;
const files = new Map<string, string>();
const versions = new Map<string, number>();

function write(name: string, text: string): string {
  const file = path.join(folder, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  files.set(file, text);
  versions.set(file, (versions.get(file) ?? 0) + 1);
  return file;
}

beforeAll(() => {
  folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-')));
  write('package.json', JSON.stringify({ name: 'fixture', type: 'module', dependencies: { tools: '1.0.0' } }));
  write('node_modules/tools/package.json', JSON.stringify({ name: 'tools', version: '1.0.0', types: 'index.d.ts' }));
  write('node_modules/tools/index.d.ts', TOOLS);
  write('globals.d.ts', GLOBALS);
  write('dog.ts', 'export class Dog {}\n');
  // The program imports the package, so its exports are auto-imports of the program.
  write('uses.ts', "import type {} from 'tools';\n");
  write('main.ts', '\n');
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    lib: ['lib.es2022.d.ts'],
    types: [],
    noEmit: true,
    allowImportingTsExtensions: true,
  };
  const roots = ['globals.d.ts', 'dog.ts', 'uses.ts', 'main.ts'].map((name) => path.join(folder, name));
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => roots,
    getScriptVersion: (file) => String(versions.get(file) ?? 0),
    getScriptSnapshot: (file) => {
      const text = files.get(file) ?? ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => folder,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (file) => files.has(file) || ts.sys.fileExists(file),
    readFile: (file) => files.get(file) ?? ts.sys.readFile(file),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  service = ts.createLanguageService(host);
});

afterAll(() => {
  service.dispose();
  fs.rmSync(folder, { recursive: true, force: true });
});

/** The completions at the end of main.ts after `text`, as TypeScript gives them and as the filter leaves them. */
function complete(text: string): { all: ts.CompletionEntry[]; kept: ts.CompletionEntry[] } {
  const file = write('main.ts', `const answer = 42;\n${text}`);
  const result = service.getCompletionsAtPosition(file, files.get(file)!.length, {
    includeCompletionsForModuleExports: true,
    includeCompletionsWithInsertText: true,
  });
  const all = result?.entries ?? [];
  return { all, kept: filterAutoImports(ts, service.getProgram()!, file, all) };
}

/** The entries of `name`, each as `name` or `name<module>` for an auto-import. */
function offers(entries: readonly ts.CompletionEntry[], name: string): string[] {
  return entries.filter((entry) => entry.name === name).map((entry) => (isAutoImport(entry) ? `${entry.name}<${entry.source}>` : entry.name));
}

describe('rule 1: the name is a global', () => {
  it('hides the auto-imports of a name whose global function exists, and keeps the global', () => {
    const { all, kept } = complete('parseInt');
    expect(offers(all, 'parseInt')).toEqual(expect.arrayContaining(['parseInt', 'parseInt<tools>']));
    expect(offers(kept, 'parseInt')).toEqual(['parseInt']);
  });

  it('hides the auto-imports of every module for that name', () => {
    const { all, kept } = complete('escape');
    expect(offers(all, 'escape')).toEqual(expect.arrayContaining(['escape', 'escape<tools>', 'escape<node:querystring>']));
    expect(offers(kept, 'escape')).toEqual(['escape']);
  });

  it('hides an interface when a global type has its name', () => {
    const { all, kept } = complete('let pet: Pet');
    expect(offers(all, 'Pet')).toEqual(expect.arrayContaining(['Pet', 'Pet<tools>']));
    expect(offers(kept, 'Pet')).toEqual(['Pet']);
  });

  it('keeps a class whose name is only a global type, because the class is also a value', () => {
    const { all, kept } = complete('new Animal');
    expect(offers(all, 'Animal')).toContain('Animal<tools>');
    expect(offers(kept, 'Animal')).toContain('Animal<tools>');
  });
});

describe('rule 2: the module exports a global with export =', () => {
  it('hides the members of a module whose export = is the global itself (node:process)', () => {
    for (const name of ['exit', 'argv', 'env']) {
      const { all, kept } = complete(name);
      expect(offers(all, name), name).toContain(`${name}<node:process>`);
      expect(offers(kept, name), name).toEqual([]);
    }
  });

  it('hides the members of a module whose export = is a variable with the name of a global (node:console)', () => {
    for (const name of ['log', 'warn']) {
      const { all, kept } = complete(name);
      expect(offers(all, name), name).toContain(`${name}<node:console>`);
      expect(offers(kept, name), name).toEqual([]);
    }
  });

  it('keeps the members of a module whose export = is no global (node:events), and hides the same names of node:process', () => {
    const { all, kept } = complete('on');
    expect(offers(all, 'on')).toEqual(expect.arrayContaining(['on<node:events>', 'on<node:process>']));
    expect(offers(kept, 'on')).toEqual(['on<node:events>']);
    expect(offers(kept, 'once')).toEqual(['once<node:events>']);
  });
});

describe('the auto-imports that a program needs', () => {
  it('keeps the named exports of modules and packages, and the classes of the workspace', () => {
    expect(offers(complete('randomInt').kept, 'randomInt')).toEqual(['randomInt<node:crypto>']);
    expect(offers(complete('round').kept, 'round')).toEqual(['round<tools>']);
    expect(offers(complete('new Dog').kept, 'Dog')).toEqual(['Dog<./dog.ts>']);
  });

  it('keeps every entry that adds no import, in its order, and leaves the list of TypeScript unchanged', () => {
    const { all, kept } = complete('a');
    const before = all.map((entry) => entry.name);
    expect(kept.filter((entry) => !isAutoImport(entry))).toEqual(all.filter((entry) => !isAutoImport(entry)));
    expect(all.map((entry) => entry.name)).toEqual(before);
    expect(kept).not.toBe(all);
  });
});

describe('the program of the package.json imports', () => {
  it('reads the module of an auto-import of a package that the program does not import yet in that program', () => {
    // A package that exports the global console with export =, in a program of its own, as the TypeScript server keeps
    // the packages of package.json that no file imports yet.
    const logger = write('node_modules/logger/index.d.ts', 'declare var console: { log(...data: unknown[]): void };\nexport = console;\n');
    const packages = ts.createProgram([logger], { noEmit: true, types: [] });
    const file = path.join(folder, 'main.ts');
    const entry: ts.CompletionEntry = {
      name: 'log',
      kind: ts.ScriptElementKind.memberFunctionElement,
      kindModifiers: '',
      sortText: '16',
      source: 'logger',
      hasAction: true,
      data: { exportName: 'log', fileName: logger, moduleSpecifier: 'logger', isPackageJsonImport: true },
    };
    const program = service.getProgram()!;
    expect(filterAutoImports(ts, program, file, [entry], () => packages)).toEqual([]);
    // Without that program, rule 2 cannot read the module and keeps the entry.
    expect(filterAutoImports(ts, program, file, [entry])).toEqual([entry]);
  });
});
