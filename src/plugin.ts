// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The TypeScript server plugin nimblescape-typescript-plugin. VS Code starts the TypeScript server (tsserver) with the
// names of the plugins of the installed extensions (contributes.typescriptServerPlugins) and their folders. The server
// loads this module from node_modules/nimblescape-typescript-plugin of the folder of the extension with require(), and
// calls it with its own TypeScript module: the TypeScript of VS Code, or the TypeScript of the workspace
// (typescript.tsdk). For each project, the plugin
//
// - gives a project without tsconfig.json (an inferred project) the defaults of ts while one of its open files is a
//   TypeScript file; a project with only JavaScript files keeps the options of VS Code (projectDefaults.ts),
// - gives a project with tsconfig.json (a configured project) of ts, whose compilerOptions.plugins names this plugin
//   as ts init writes it, what ts gives it: every file an ES module without a package.json, and the types of
//   prompt(), alert() and confirm() unless it has lib dom (projectDefaults.ts); any other configured project is a
//   standard project, for example a Vite project, and the plugin leaves its language service as it is,
// - wraps the language service and filters its auto-import completions and its quick fixes "Add import"
//   (autoImportFilter.ts) with the assignment root of the file (assignmentRoot.ts); not in an inferred project with
//   only JavaScript files, which keeps the completions of VS Code, as it keeps its options.
//
// The settings of the assignment roots come from the entry of the plugin in tsconfig.json (compilerOptions.plugins),
// else from the settings nimblescape.typescript.* of VS Code, which the extension sends (configurePlugin, with the
// folders that VS Code has open), else the defaults apply. esbuild bundles this file into dist/plugin.js, and
// plugin/package.json names that file.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as ts from 'typescript';
import { assignmentRoot, DEFAULT_SETTINGS, isInside, readSettings, type AssignmentSettings } from './assignmentRoot.ts';
import { filterAutoImports, filterImportFixes, type TypeScript } from './autoImportFilter.ts';
import { isTsProject, PLUGIN_NAME } from './defaults.ts';
import { applyConfiguredDefaults, applyDefaults } from './projectDefaults.ts';

/**
 * A project of the TypeScript server with the program of its package.json imports. The method is internal to
 * TypeScript, so the plugin calls it only when the project has it.
 */
interface ProjectWithPackageJsonImports {
  getPackageJsonAutoImportProvider?(): ts.Program | undefined;
}

/** What the extension sends with configurePlugin (src/pluginSettings.ts). */
interface ExtensionConfig {
  assignmentFolders?: unknown;
  entryFiles?: unknown;
  workspaceFolders?: unknown;
}

function init(modules: { typescript: TypeScript }): ts.server.PluginModule {
  const typescript = modules.typescript;
  let extension: ExtensionConfig = {};

  /** The folder that VS Code has open around `file`: from the extension, else the nearest folder with .git. */
  const repositoryRoot = (file: string): string | undefined => {
    const folders = Array.isArray(extension.workspaceFolders) ? (extension.workspaceFolders as unknown[]).filter((f) => typeof f === 'string') : [];
    const open = (folders as string[]).filter((folder) => isInside(folder, file)).sort((a, b) => b.length - a.length)[0];
    if (open !== undefined) return open;
    for (let current = path.dirname(file); path.dirname(current) !== current; current = path.dirname(current)) {
      if (fs.existsSync(path.join(current, '.git'))) return current;
    }
    return undefined;
  };

  return {
    onConfigurationChanged(config: ExtensionConfig) {
      extension = config ?? {};
    },
    create(info) {
      const service = info.languageService;
      const project = info.project;
      const logger = project.projectService.logger;
      // The entry of tsconfig.json wins over the settings of VS Code.
      const settings = (): AssignmentSettings => readSettings(info.config, readSettings(extension, DEFAULT_SETTINGS));
      const root = (fileName: string) => assignmentRoot(fileName, repositoryRoot(fileName), settings(), fs.existsSync);
      // False while the filter leaves the completions and the quick fixes as TypeScript gives them.
      let filters = () => true;
      if (project.projectKind === typescript.server.ProjectKind.Inferred) {
        try {
          const name = project.getProjectName();
          // Rule 1 would hide the import of a package whose name is a global of the browser, for example the icon Map of
          // lucide-react in a Vite project with JavaScript.
          filters = applyDefaults(typescript, project as never, settings, repositoryRoot, (message) => logger.info(`${PLUGIN_NAME}: ${name}: ${message}`));
          logger.info(`${PLUGIN_NAME}: the defaults of ts apply to ${name} while a TypeScript file is open`);
        } catch (error) {
          logger.info(`${PLUGIN_NAME}: the defaults of ts failed: ${error instanceof Error ? error.stack : String(error)}`);
        }
      } else if (project.projectKind === typescript.server.ProjectKind.Configured) {
        // The TypeScript server loads the plugin for every project (globalPlugins), and through the entry of a
        // tsconfig.json instead of that. A tsconfig.json without the entry keeps what TypeScript gives, so the editor
        // shows what tsc and the build of the project show.
        if (!isTsProject(project.getCompilerOptions().plugins)) {
          logger.info(`${PLUGIN_NAME}: ${project.getProjectName()} is a standard project: its tsconfig.json does not name the plugin`);
          return service;
        }
        try {
          applyConfiguredDefaults(project);
          logger.info(`${PLUGIN_NAME}: the package.json and the types of prompt() of ts apply to ${project.getProjectName()}`);
        } catch (error) {
          logger.info(`${PLUGIN_NAME}: the defaults of ts for a tsconfig.json failed: ${error instanceof Error ? error.stack : String(error)}`);
        }
      }
      logger.info(`${PLUGIN_NAME}: filters the auto-import completions of ${project.getProjectName()} with TypeScript ${typescript.version}`);
      // The proxy forwards every method to the language service and replaces two of them.
      const proxy = Object.create(null) as ts.LanguageService;
      for (const name of Object.keys(service) as (keyof ts.LanguageService)[]) {
        const method = service[name] as (...args: unknown[]) => unknown;
        (proxy as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => method.apply(service, args);
      }
      proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
        const result = service.getCompletionsAtPosition(fileName, position, options, formattingSettings);
        const program = result && service.getProgram();
        if (!result || !program || !filters()) return result;
        try {
          // A new object: TypeScript keeps the result of an incomplete list for the next request.
          const packageJsonProgram = () => (project as unknown as ProjectWithPackageJsonImports).getPackageJsonAutoImportProvider?.();
          return { ...result, entries: filterAutoImports(typescript, program, fileName, result.entries, packageJsonProgram, root(fileName)) };
        } catch (error) {
          // The completions stay complete when the filter fails.
          logger.info(`${PLUGIN_NAME}: the filter failed, the completions stay unfiltered: ${error instanceof Error ? error.stack : String(error)}`);
          return result;
        }
      };
      proxy.getCodeFixesAtPosition = (fileName, start, end, errorCodes, formatOptions, preferences) => {
        const fixes = service.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
        if (!filters()) return fixes;
        try {
          return filterImportFixes(fixes, fileName, root(fileName));
        } catch (error) {
          logger.info(`${PLUGIN_NAME}: the filter of the quick fixes failed: ${error instanceof Error ? error.stack : String(error)}`);
          return fixes;
        }
      };
      return proxy;
    },
  };
}

export = init;
