// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The rules of the filter of the auto-import completions. TypeScript offers an auto-import for every export of every
// module that the program can import, also when the name of the export is a global already: `parseInt` from
// es-toolkit/compat next to the global `parseInt`, and `log` from node:console, whose module exports the global
// `console` with `export =`. A student who chooses such an entry gets an import that the program does not need. The
// filter removes these entries with three rules that read the program, and with no list of names:
//
// 1. The name of the entry is visible in the global scope of the file (the global scope and the top level of the file).
// 2. The module of the entry exports a global with `export =`: its export is a variable whose name is a global, as
//    `console` of node:console and `process` of node:process.
// 3. The module of the entry is a file of the student outside the assignment root of the file (assignmentRoot.ts):
//    `Car` of another assignment. A package and a module of Node.js always stay. The quick fixes "Add import" follow
//    the same rule (filterImportFixes).
//
// An auto-import of a package that the program does not import yet, but that package.json lists, comes from a second
// program of the TypeScript server, the program of the package.json imports; rule 2 reads its module there.
//
// This file only uses the TypeScript module that it gets, so the plugin works with the TypeScript of VS Code and with
// the TypeScript of the workspace (typescript.tsdk). It imports TypeScript for its types only.

import * as path from 'node:path';
import type * as ts from 'typescript';
import { isInside, isOwnFile } from './assignmentRoot.ts';

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

/** True when rule 3 hides a module file: a file of the student outside the assignment root. */
function outsideRoot(root: string | undefined, moduleFile: string): boolean {
  return root !== undefined && isOwnFile(moduleFile) && !isInside(root, moduleFile);
}

/**
 * The entries without the auto-imports of rules 1 to 3 (see the head of this file). The other entries keep their
 * order. The entries of `entries` stay unchanged. `packageJsonProgram` gives the program of the package.json imports,
 * when the TypeScript server has one; `root` is the assignment root of the file, if it has one.
 */
export function filterAutoImports(
  typescript: TypeScript,
  program: ts.Program,
  fileName: string,
  entries: readonly ts.CompletionEntry[],
  packageJsonProgram: () => ts.Program | undefined = () => undefined,
  root?: string,
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
    // Rule 3. An ambient module (node:fs) and a package of package.json have no file of the student.
    const { data } = entry;
    if (data.ambientModuleName === undefined && !data.isPackageJsonImport && data.fileName !== undefined && outsideRoot(root, data.fileName)) {
      return false;
    }
    return !moduleExportsGlobal(data);
  });
}

/**
 * The quick fixes without the fixes "Add import" and "Update import" of rule 3: an import of a relative module whose
 * file lies outside the assignment root. The fix names the module only in its text changes, as `from "./car.ts"`.
 */
export function filterImportFixes(
  fixes: readonly ts.CodeFixAction[],
  fileName: string,
  root: string | undefined,
): ts.CodeFixAction[] {
  if (root === undefined) return [...fixes];
  return fixes.filter((fix) => {
    if (fix.fixName !== 'import') return true;
    const texts = fix.changes.flatMap((change) => change.textChanges.map((textChange) => textChange.newText));
    return !texts.some((text) =>
      [...text.matchAll(/\bfrom\s*(["'])(\.{1,2}\/[^"']*)\1/g)].some((match) => outsideRoot(root, path.resolve(path.dirname(fileName), match[2]))),
    );
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
