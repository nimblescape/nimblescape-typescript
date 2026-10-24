// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The rules of the filter of the auto-import completions. TypeScript offers an auto-import for every export of every
// module that the program can import, also when the name of the export is a global already: `parseInt` from
// es-toolkit/compat next to the global `parseInt`, and `log` from node:console, whose module exports the global
// `console` with `export =`. A student who chooses such an entry gets an import that the program does not need. The
// filter removes these entries with two rules that read the program, and with no list of names:
//
// 1. The name of the entry is visible in the global scope of the file (the global scope and the top level of the file).
// 2. The module of the entry exports a global with `export =`: its export is a variable whose name is a global, as
//    `console` of node:console and `process` of node:process.
//
// An auto-import of a package that the program does not import yet, but that package.json lists, comes from a second
// program of the TypeScript server, the program of the package.json imports; rule 2 reads its module there.
//
// This file only uses the TypeScript module that it gets, so the plugin works with the TypeScript of VS Code and with
// the TypeScript of the workspace (typescript.tsdk). It imports TypeScript for its types only.

import type * as ts from 'typescript';

/** The TypeScript module of the running TypeScript server. */
export type TypeScript = typeof ts;

/** The data of an entry that adds an import when the user chooses it. */
type AutoImport = ts.CompletionEntry & { data: ts.CompletionEntryData };

/**
 * True for an entry that adds an import when the user chooses it: TypeScript gives such an entry the data to resolve
 * its import, with the name of the export.
 */
export function isAutoImport(entry: ts.CompletionEntry): entry is AutoImport {
  return typeof entry.data?.exportName === 'string';
}

/**
 * The entries without the auto-imports of rule 1 and rule 2 (see the head of this file). The other entries keep their
 * order. The entries of `entries` stay unchanged. `packageJsonProgram` gives the program of the package.json imports,
 * when the TypeScript server has one.
 */
export function filterAutoImports(
  typescript: TypeScript,
  program: ts.Program,
  fileName: string,
  entries: readonly ts.CompletionEntry[],
  packageJsonProgram: () => ts.Program | undefined = () => undefined,
): ts.CompletionEntry[] {
  const file = program.getSourceFile(fileName);
  if (!file || !entries.some(isAutoImport)) return [...entries];
  const checker = program.getTypeChecker();
  const names = (meaning: ts.SymbolFlags) => new Set(checker.getSymbolsInScope(file, meaning).map((symbol) => symbol.name));
  const values = names(typescript.SymbolFlags.Value);
  const types = names(typescript.SymbolFlags.Type | typescript.SymbolFlags.Namespace);
  // Rule 2 reads each module once per request.
  const modules = new Map<string, boolean>();
  const moduleExportsGlobal = (data: ts.CompletionEntryData): boolean => {
    const key = `${data.isPackageJsonImport ? 'package.json' : 'program'}:${data.ambientModuleName ?? data.fileName}`;
    let result = modules.get(key);
    if (result === undefined) {
      const source = data.isPackageJsonImport ? packageJsonProgram() : program;
      result = source !== undefined && exportsGlobal(typescript, source, data, values);
      modules.set(key, result);
    }
    return result;
  };

  return entries.filter((entry) => {
    if (!isAutoImport(entry)) return true;
    // Rule 1. An interface or a type alias can only be a type, so only a global type hides it.
    const typeOnly = entry.kind === typescript.ScriptElementKind.interfaceElement || entry.kind === typescript.ScriptElementKind.typeElement;
    if ((typeOnly ? types : values).has(entry.name)) return false;
    return !moduleExportsGlobal(entry.data);
  });
}

/**
 * Rule 2 for the module of an auto-import of `program`: true when the module exports with `export =` a variable whose
 * name is in `globals`.
 */
function exportsGlobal(typescript: TypeScript, program: ts.Program, data: ts.CompletionEntryData, globals: Set<string>): boolean {
  const exportEquals = moduleSymbol(program, data)?.exports?.get(typescript.InternalSymbolName.ExportEquals);
  if (!exportEquals) return false;
  // A symbol of a program belongs to the checker of that program.
  const target = exportEquals.flags & typescript.SymbolFlags.Alias ? program.getTypeChecker().getAliasedSymbol(exportEquals) : exportEquals;
  // An `export =` of an expression that is no name, such as `export = {}`, has the name "export=".
  return target.name !== typescript.InternalSymbolName.ExportEquals && globals.has(target.name);
}

/**
 * The symbol of the module of an auto-import: of an ambient module (`declare module "node:console"`) by its name, else
 * of its source file.
 */
function moduleSymbol(program: ts.Program, data: ts.CompletionEntryData): ts.Symbol | undefined {
  const checker = program.getTypeChecker();
  if (data.ambientModuleName !== undefined) {
    const name = JSON.stringify(data.ambientModuleName);
    return checker.getAmbientModules().find((module) => module.name === name);
  }
  const file = data.fileName === undefined ? undefined : program.getSourceFile(data.fileName);
  return file && checker.getSymbolAtLocation(file);
}
