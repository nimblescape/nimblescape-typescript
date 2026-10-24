// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The TypeScript server plugin nimblescape-typescript-plugin. VS Code starts the TypeScript server (tsserver) with the
// names of the plugins of the installed extensions (contributes.typescriptServerPlugins) and their folders. The server
// loads this module from node_modules/nimblescape-typescript-plugin of the folder of the extension with require(), and
// calls it with its own TypeScript module: the TypeScript of VS Code, or the TypeScript of the workspace
// (typescript.tsdk). The plugin wraps the language service of each project and filters its completions
// (autoImportFilter.ts). esbuild bundles this file into dist/plugin.js, and plugin/package.json names that file.

import type * as ts from 'typescript';
import { filterAutoImports, type TypeScript } from './autoImportFilter.ts';

/** The name of the plugin, from plugin/package.json and contributes.typescriptServerPlugins. */
const PLUGIN_NAME = 'nimblescape-typescript-plugin';

/**
 * A project of the TypeScript server with the program of its package.json imports. The method is internal to
 * TypeScript, so the plugin calls it only when the project has it.
 */
interface ProjectWithPackageJsonImports {
  getPackageJsonAutoImportProvider?(): ts.Program | undefined;
}

function init(modules: { typescript: TypeScript }): ts.server.PluginModule {
  const typescript = modules.typescript;
  return {
    create(info) {
      const service = info.languageService;
      const logger = info.project.projectService.logger;
      logger.info(`${PLUGIN_NAME}: filters the auto-import completions of ${info.project.getProjectName()} with TypeScript ${typescript.version}`);
      // The proxy forwards every method to the language service and replaces getCompletionsAtPosition.
      const proxy = Object.create(null) as ts.LanguageService;
      for (const name of Object.keys(service) as (keyof ts.LanguageService)[]) {
        const method = service[name] as (...args: unknown[]) => unknown;
        (proxy as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => method.apply(service, args);
      }
      proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
        const result = service.getCompletionsAtPosition(fileName, position, options, formattingSettings);
        const program = result && service.getProgram();
        if (!result || !program) return result;
        try {
          // A new object: TypeScript keeps the result of an incomplete list for the next request.
          const project = info.project as unknown as ProjectWithPackageJsonImports;
          const packageJsonProgram = () => project.getPackageJsonAutoImportProvider?.();
          return { ...result, entries: filterAutoImports(typescript, program, fileName, result.entries, packageJsonProgram) };
        } catch (error) {
          // The completions stay complete when the filter fails.
          logger.info(`${PLUGIN_NAME}: the filter failed, the completions stay unfiltered: ${error instanceof Error ? error.stack : String(error)}`);
          return result;
        }
      };
      return proxy;
    },
  };
}

export = init;
