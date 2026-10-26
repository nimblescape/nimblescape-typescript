// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The check and the compilation of a file: one run of tsc with a temporary tsconfig.json in the folder of the run.
//
// - With a tsconfig.json in the folder of the file or above, the temporary tsconfig.json extends it, so every setting
//   of the project applies. Only a project of ts, whose tsconfig.json names the editor plugin in
//   compilerOptions.plugins as ts --init writes it, gets the rules of ts below (the polyfills, every file an ES
//   module); any other tsconfig.json is a standard project, which ts checks as tsc does. tsc looks for the type
//   packages (node_modules/@types) from the folder of the tsconfig.json that it reads, which is the folder of the run,
//   so the temporary tsconfig.json names the folders node_modules/@types of the project as typeRoots, unless the
//   project sets typeRoots itself. Without a tsconfig.json, it holds the defaults of ts (defaults.ts) and the type
//   folder of ts.
// - The types of the polyfills prompt(), alert() and confirm() are part of every check of ts, as Deno has them in its
//   built-in library: in a project of ts, the temporary tsconfig.json lists the file of the type folder of ts, unless
//   the project has the types of the browser (lib dom), which declare the three functions themselves. So the project
//   needs no file of its own for them, and plain tsc does not know them (README, "Limits").
// - It names only the file (`files`), so tsc checks the file and the modules that it imports, as Deno does, and not
//   every file of the project: a broken file elsewhere in the course does not stop the program. The declaration files
//   of the project (.d.ts, for example the globals.d.ts of a course) stay part of the check.
// - To run the file, it adds the output settings: tsc writes the JavaScript and the source maps into the folder of
//   the run, and writes nothing when the check finds an error (noEmitOnError). rootDir is the root of the file
//   system, so a file may import from any folder.
// - A JavaScript file runs the same way (allowJs, also with a tsconfig.json): tsc checks its syntax, and its types only
//   with the comment // @ts-check, as Deno does.
//
// TypeScript 6 runs inside this process: its executeCommandLine, the code of the command tsc, runs with a System
// whose package.json at the root of the file system is VIRTUAL_PACKAGE_JSON when no folder above the file has a
// package.json, so every file is an ES module, as in Deno, also in a project of ts with a tsconfig.json. VS Code
// ships typescript.js without tsc.js, so this also works with the TypeScript of VS Code. TypeScript 7 has no such
// programming interface: ts starts its command tsc, and a folder without package.json and tsconfig.json uses module
// preserve with moduleResolution bundler instead (README, "Limits").

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as ts from 'typescript';
import { DEFAULT_COMPILER_OPTIONS, findUp, GLOBALS_TYPES, hasBrowserTypes, isJavaScriptFile, isTsProject, rootPackageJson, VIRTUAL_PACKAGE_JSON } from '../defaults.ts';
import { parseJsonc } from './jsonc.ts';
import { packageFolder, readManifest, type TypeScriptInstall } from './typescript.ts';

/** TypeScript 6 with executeCommandLine, the code of the command tsc, which the types of TypeScript do not name. */
export type TypeScriptModule = typeof ts & {
  executeCommandLine(system: ts.System, callback: (program: unknown) => void, args: readonly string[]): void;
};

/** The environment variable with the folder of the package of ts whose type folder ts uses (set by the extension). */
export const TYPES_VARIABLE = 'NIMBLESCAPE_TS_TYPES';

/** The folder of this package (the parent of dist/), which holds types/ and depends on @types/node. */
export function packageRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return environment[TYPES_VARIABLE] || path.resolve(__dirname, '..');
}

/**
 * The type roots of a file without tsconfig.json: the node_modules/@types folders of the folder of the file and
 * above, so the types of a project win, then the type folder of ts with the polyfills and the @types/node of ts.
 */
export function typeRoots(folder: string, environment: NodeJS.ProcessEnv = process.env): string[] {
  const roots = projectTypeRoots(folder);
  const own = packageRoot(environment);
  roots.push(path.join(own, 'types'));
  const node = packageFolder('@types/node', own);
  if (node !== undefined && !roots.includes(path.dirname(node))) roots.push(path.dirname(node));
  return roots;
}

/** The declaration file of the polyfills in the type folder of ts: types/nimblescape-globals/index.d.ts. */
export function globalsFile(environment: NodeJS.ProcessEnv = process.env): string {
  return path.join(packageRoot(environment), 'types', GLOBALS_TYPES, 'index.d.ts');
}

/** The folders node_modules/@types of `folder` and above that exist: the type roots that tsc uses by default. */
export function projectTypeRoots(folder: string): string[] {
  const roots: string[] = [];
  for (let current = path.resolve(folder); ; current = path.dirname(current)) {
    const types = path.join(current, 'node_modules', '@types');
    if (fs.existsSync(types)) roots.push(types);
    if (path.dirname(current) === current) break;
  }
  return roots;
}

/** What ts knows about the project of a file. */
export interface Project {
  /** The file, with its full path. */
  readonly file: string;
  /** The nearest tsconfig.json, or undefined. */
  readonly config: string | undefined;
  /** The folder of the nearest package.json, or undefined. */
  readonly packageRoot: string | undefined;
  /**
   * The module system of the output: "type" of the nearest package.json, or "module" without a package.json and
   * without a tsconfig.json. Undefined for a package.json without "type", and for a tsconfig.json without a
   * package.json: Node.js then reads the syntax of each file, as it does for the project itself, so the output of tsc
   * runs whether tsc wrote CommonJS or an ES module.
   */
  readonly moduleType: 'module' | 'commonjs' | undefined;
}

export function projectOfFile(file: string): Project {
  const absolute = path.resolve(file);
  const folder = path.dirname(absolute);
  const configFolder = findUp(folder, 'tsconfig.json', fs.existsSync);
  const root = findUp(folder, 'package.json', fs.existsSync);
  // Without a package.json, every file is an ES module for tsc (VIRTUAL_PACKAGE_JSON). The output gets "type": "module"
  // only without a tsconfig.json: the "module" of a tsconfig.json may still make tsc write CommonJS, so Node.js reads
  // the syntax of each file of the output.
  const type = root !== undefined ? readManifest(root)?.type : configFolder === undefined ? 'module' : undefined;
  return {
    file: absolute,
    config: configFolder === undefined ? undefined : path.join(configFolder, 'tsconfig.json'),
    packageRoot: root,
    moduleType: type === 'module' || type === 'commonjs' ? type : undefined,
  };
}

/** What the temporary tsconfig.json takes from the tsconfig.json of a project. */
interface ProjectSettings {
  /** The files of the project, with their full paths. */
  readonly files: string[];
  /** Its declaration files (for example a globals.d.ts), with their full paths. */
  readonly declarations: string[];
  /** Whether it sets typeRoots. */
  readonly typeRoots: boolean;
  /** Its setting lib, undefined without one. */
  readonly lib: string[] | undefined;
  /** Whether it is a project of ts: its setting plugins names the editor plugin. */
  readonly ts: boolean;
}

/**
 * The settings of the tsconfig.json of a project that the temporary tsconfig.json needs. TypeScript 6 answers in this
 * process; TypeScript 7 has no such programming interface, so its tsc prints the settings of the project
 * (--showConfig).
 */
function projectConfig(install: TypeScriptInstall, typescript: typeof ts | undefined, config: string): ProjectSettings {
  const isDeclaration = (name: string) => /\.d\.[cm]?ts$/.test(name);
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : undefined);
  const settings = (files: string[], typeRoots: boolean, lib: string[] | undefined, plugins: unknown): ProjectSettings => ({
    files,
    declarations: files.filter(isDeclaration),
    typeRoots,
    lib,
    ts: isTsProject(plugins),
  });
  // A broken tsconfig.json: the check itself reports the error of tsc.
  const broken = settings([], false, undefined, undefined);
  if (typescript) {
    const read = typescript.readConfigFile(config, typescript.sys.readFile);
    if (read.error) return broken;
    const parsed = typescript.parseJsonConfigFileContent(read.config, typescript.sys, path.dirname(config), undefined, config);
    return settings(parsed.fileNames, parsed.options.typeRoots !== undefined, parsed.options.lib, parsed.options.plugins);
  }
  const manifest = readManifest(install.folder) as { bin?: Record<string, string> } | undefined;
  const bin = path.join(install.folder, manifest?.bin?.tsc ?? 'bin/tsc');
  const result = spawnSync(process.execPath, [bin, '--showConfig', '--project', config], { encoding: 'utf8' });
  try {
    const shown = JSON.parse(result.stdout) as { compilerOptions?: Record<string, unknown>; files?: unknown };
    const files = (strings(shown.files) ?? []).map((name) => path.resolve(path.dirname(config), name));
    return settings(files, shown.compilerOptions?.typeRoots !== undefined, strings(shown.compilerOptions?.lib), shown.compilerOptions?.plugins);
  } catch {
    return broken;
  }
}

/** The files that a check adds to the files of a project of ts: the types of the polyfills, unless it has lib dom. */
function addedFiles(settings: ProjectSettings): string[] {
  return !settings.ts || hasBrowserTypes(settings.lib) ? [] : [globalsFile()];
}

/**
 * The typeRoots of a temporary tsconfig.json in `folder` that extends the tsconfig.json `config`. tsc looks for type
 * packages from the folder of the temporary tsconfig.json. A run folder outside the project (no package.json) misses
 * the project's node_modules/@types, so the type roots name them. Only then: with typeRoots, tsc no longer looks into
 * node_modules for the "types" of the project, such as "vite/client".
 */
function extendedTypeRoots(config: string, folder: string, settings: ProjectSettings): { typeRoots?: string[] } {
  const own = projectTypeRoots(path.dirname(config));
  const found = projectTypeRoots(folder);
  const missing = !settings.typeRoots && own.some((root) => !found.includes(root));
  return missing ? { typeRoots: [...new Set([...own, ...found])] } : {};
}

export interface Job {
  readonly project: Project;
  readonly typescript: TypeScriptInstall;
  /** The folder of the run, which receives tsconfig.json and, for a run, the output in out/. */
  readonly folder: string;
  /** Only check: no output. */
  readonly checkOnly: boolean;
}

/** The loaded TypeScript 6 module of an install, or undefined for TypeScript 7 and later. */
export function loadTypeScript(install: TypeScriptInstall): TypeScriptModule | undefined {
  if (install.major >= 7) return undefined;
  const typescript = require(path.join(install.folder, 'lib', 'typescript.js')) as TypeScriptModule;
  return typeof typescript.executeCommandLine === 'function' ? typescript : undefined;
}

/** The folder of the output of a job; the compiled file is <out>/<path of the file>. */
export const outFolder = (job: Pick<Job, 'folder'>): string => path.join(job.folder, 'out');

/** The path of the compiled file of `file` in the output folder. */
export function outputFile(job: Pick<Job, 'project' | 'folder'>): string {
  const file = job.project.file;
  const relative = path.relative(path.parse(file).root, file).replace(/\.([cm]?)tsx?$/, (_, kind: string) => `.${kind}js`);
  return path.join(outFolder(job), relative);
}

/** What ts reads from the tsconfig.json of the project of a job; undefined without a tsconfig.json. */
function jobSettings(job: Job, typescript: typeof ts | undefined): ProjectSettings | undefined {
  return job.project.config === undefined ? undefined : projectConfig(job.typescript, typescript, job.project.config);
}

/** The temporary tsconfig.json of a job. */
export function temporaryConfig(job: Job, typescript: typeof ts | undefined, settings = jobSettings(job, typescript)): Record<string, unknown> {
  const { project } = job;
  const output = job.checkOnly
    ? { noEmit: true }
    : {
        noEmit: false,
        outDir: outFolder(job),
        rootDir: path.parse(project.file).root,
        sourceMap: true,
        noEmitOnError: true,
        // A tsconfig.json for a library may ask for more output, which a run does not need.
        declaration: false,
        declarationMap: false,
        emitDeclarationOnly: false,
        composite: false,
        incremental: false,
      };
  if (project.config !== undefined && settings !== undefined) {
    const roots = extendedTypeRoots(project.config, job.folder, settings);
    return {
      extends: project.config,
      // A JavaScript file runs also when the tsconfig.json does not allow JavaScript.
      compilerOptions: { ...output, ...roots, rewriteRelativeImportExtensions: true, ...(isJavaScriptFile(project.file) ? { allowJs: true } : {}) },
      files: [...new Set([project.file, ...settings.declarations, ...addedFiles(settings)])],
      include: [],
    };
  }
  const options: Record<string, unknown> = { ...DEFAULT_COMPILER_OPTIONS, typeRoots: typeRoots(path.dirname(project.file)) };
  // TypeScript 7 cannot read the virtual package.json: without a package.json, a file stays an ES module this way.
  if (job.typescript.major >= 7 && project.packageRoot === undefined) Object.assign(options, { module: 'preserve', moduleResolution: 'bundler' });
  return { compilerOptions: { ...options, ...output }, files: [project.file], include: [] };
}

/** The System of tsc with the virtual package.json at the root of the file system. */
export function virtualSystem(typescript: TypeScriptModule, file: string): ts.System {
  const virtual = rootPackageJson(file);
  const real = typescript.sys;
  const isVirtual = (name: string) => path.resolve(name) === virtual && !real.fileExists(virtual);
  return {
    ...real,
    fileExists: (name) => isVirtual(name) || real.fileExists(name),
    readFile: (name, encoding) => (isVirtual(name) ? VIRTUAL_PACKAGE_JSON : real.readFile(name, encoding)),
  };
}

/** Runs tsc with `args` and returns its exit code. TypeScript 6 runs in this process, TypeScript 7 as its program. */
export function runTsc(install: TypeScriptInstall, typescript: TypeScriptModule | undefined, args: string[], file?: string): number {
  if (!typescript) {
    const manifest = readManifest(install.folder) as { bin?: Record<string, string> } | undefined;
    const bin = path.join(install.folder, manifest?.bin?.tsc ?? 'bin/tsc');
    const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' });
    return result.status ?? 1;
  }
  const base = file === undefined ? typescript.sys : virtualSystem(typescript, file);
  let code = 0;
  const system: ts.System = { ...base, exit: (status) => void (code = status ?? 0) };
  typescript.executeCommandLine(system, () => {}, args);
  return code;
}

/** Writes the temporary tsconfig.json of a job and runs tsc with it; returns the exit code of tsc. */
export function compile(job: Job): number {
  const typescript = loadTypeScript(job.typescript);
  const settings = jobSettings(job, typescript);
  fs.mkdirSync(job.folder, { recursive: true });
  const config = path.join(job.folder, 'tsconfig.json');
  fs.writeFileSync(config, `${JSON.stringify(temporaryConfig(job, typescript, settings), null, 2)}\n`);
  // Node.js reads the module system of the output from the nearest package.json, which is this one. Without a
  // "type", the folder gets no package.json: Node.js looks no further than the folder node_modules/ that holds the
  // folder of the run, and reads the syntax of each file without the warning of a package.json without "type".
  if (!job.checkOnly) {
    fs.mkdirSync(outFolder(job), { recursive: true });
    const type = job.project.moduleType;
    if (type !== undefined) fs.writeFileSync(path.join(outFolder(job), 'package.json'), `${JSON.stringify({ type })}\n`);
  }
  // Without a package.json, also with the tsconfig.json of a project of ts: every file is an ES module, as in Deno.
  const virtual = job.project.packageRoot === undefined && (settings === undefined || settings.ts);
  return runTsc(job.typescript, typescript, ['--project', config], virtual ? job.project.file : undefined);
}

/**
 * `ts --check` without a file: the tsconfig.json of the folder. A project with references, as the tsconfig.json of a
 * Vite project, is checked in build mode, as `tsc -b` does; any other project with --noEmit, so a check writes no
 * output. When the check adds the types of the polyfills (a project of ts), a temporary tsconfig.json in `folder`
 * extends the tsconfig.json and lists the files of the project and the added files.
 */
export function checkProject(install: TypeScriptInstall, config: string, folder: string): number {
  const typescript = loadTypeScript(install);
  const settings = projectConfig(install, typescript, config);
  // Without a package.json, every file of a project of ts is an ES module, as for the check of one file.
  const virtual = settings.ts && findUp(path.dirname(config), 'package.json', fs.existsSync) === undefined ? config : undefined;
  const references = parseJsonc(fs.readFileSync(config, 'utf8'))?.references;
  if (Array.isArray(references) && references.length > 0) return runTsc(install, typescript, ['--build', config], virtual);
  const added = addedFiles(settings);
  if (added.length === 0) return runTsc(install, typescript, ['--project', config, '--noEmit'], virtual);
  const temporary = path.join(folder, 'tsconfig.json');
  const json = {
    extends: config,
    compilerOptions: { noEmit: true, ...extendedTypeRoots(config, folder, settings) },
    files: [...new Set([...settings.files, ...added])],
    include: [],
  };
  fs.writeFileSync(temporary, `${JSON.stringify(json, null, 2)}\n`);
  return runTsc(install, typescript, ['--project', temporary], virtual);
}
