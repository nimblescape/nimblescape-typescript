// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A small client of the TypeScript server (tsserver.js) for the tests: it starts the server as the TypeScript extension
// of VS Code does, with the plugin of the extension as a global plugin and the folder of the extension as the place to
// look for it, and sends requests in the protocol of the server.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type ts from 'typescript';

export type CompletionEntry = ts.server.protocol.CompletionEntry;

export const PLUGIN = 'nimblescape-typescript-plugin';

/**
 * A copy of the TypeScript package of `tsserver` in `folder`, for a server without the plugin. For the entry of a
 * tsconfig.json, the server also looks for plugins from the folder three levels above tsserver.js, the node_modules
 * of the examples, and from there it would find the plugin of this repository. `folder` must lie outside the
 * repository.
 */
export function isolatedTsserver(tsserver: string, folder: string): string {
  const target = path.join(folder, 'node_modules', 'typescript');
  if (!fs.existsSync(target)) fs.cpSync(path.dirname(path.dirname(tsserver)), target, { recursive: true });
  return path.join(target, 'lib', path.basename(tsserver));
}

export class TsServer {
  private readonly child: ChildProcess;
  private seq = 0;
  private readonly pending = new Map<number, (response: ts.server.protocol.Response) => void>();
  private buffer = Buffer.alloc(0);

  /**
   * Starts `tsserver` with the log file `logFile`. With `extensionFolder`, the server loads the plugin from the folder
   * node_modules/nimblescape-typescript-plugin of that folder.
   */
  constructor(tsserver: string, logFile: string, extensionFolder?: string) {
    // --useInferredProjectPerProjectRoot: one inferred project per folder that VS Code has open, as VS Code starts it.
    const args = [tsserver, '--useInferredProjectPerProjectRoot', '--disableAutomaticTypingAcquisition', '--logVerbosity', 'normal', '--logFile', logFile];
    if (extensionFolder) args.push('--globalPlugins', PLUGIN, '--pluginProbeLocations', extensionFolder);
    this.child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    this.child.stdout!.on('data', (data: Buffer) => this.read(data));
  }

  /** Reads the messages of the server: each one is a header with its length and a JSON body. */
  private read(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const length = Number(/Content-Length: (\d+)/.exec(this.buffer.subarray(0, headerEnd).toString('ascii'))?.[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const message = JSON.parse(this.buffer.subarray(start, start + length).toString('utf8'));
      this.buffer = this.buffer.subarray(start + length);
      if (message.type === 'response') {
        this.pending.get(message.request_seq)?.(message);
        this.pending.delete(message.request_seq);
      }
    }
  }

  request<T extends ts.server.protocol.Response>(command: string, args?: object): Promise<T> {
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(seq, resolve as (response: ts.server.protocol.Response) => void);
      this.child.stdin!.write(`${JSON.stringify({ seq, type: 'request', command, arguments: args })}\n`);
    });
  }

  /** Sets the preferences that the TypeScript extension of VS Code sets for completions with auto-imports. */
  async configure(): Promise<void> {
    await this.request('configure', {
      preferences: {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        includeCompletionsForImportStatements: true,
        includePackageJsonAutoImports: 'auto',
        allowIncompleteCompletions: true,
      },
    });
  }

  /**
   * The completions at the end of `text` in the open file `file`. The server gives an incomplete list while it still
   * collects the exports of the packages; the client asks again, as VS Code does, until the list is complete.
   */
  async complete(file: string, text: string): Promise<readonly CompletionEntry[]> {
    await this.request('open', { file, fileContent: text, scriptKindName: 'TS' });
    const lines = text.split('\n');
    const position = { file, line: lines.length, offset: lines[lines.length - 1].length + 1 };
    let body: ts.server.protocol.CompletionInfo | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const triggerKind = attempt === 0 ? 1 : 3; // Invoked, then TriggerForIncompleteCompletions.
      body = (await this.request<ts.server.protocol.CompletionInfoResponse>('completionInfo', { ...position, triggerKind })).body;
      if (!body?.isIncomplete) break;
    }
    await this.request('close', { file });
    return body?.entries ?? [];
  }

  /**
   * Sends the options of the inferred projects that the TypeScript extension of VS Code 1.143 sends for TypeScript 6
   * (inferredProjectCompilerOptions of its source, with the default settings js/ts.implicitProjectConfig.*).
   */
  async configureInferredProjects(): Promise<void> {
    await this.request('compilerOptionsForInferredProjects', {
      options: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2024',
        jsx: 'react-jsx',
        allowJs: true,
        allowSyntheticDefaultImports: true,
        allowImportingTsExtensions: true,
        strictNullChecks: true,
        strictFunctionTypes: true,
        sourceMap: true,
      },
    });
  }

  /** Opens a file of the disk as VS Code does, with the folder that VS Code has open. */
  async open(file: string, projectRootPath: string): Promise<void> {
    await this.request('open', { file, projectRootPath, scriptKindName: /\.[cm]?jsx?$/.test(file) ? 'JS' : 'TS' });
  }

  /** Closes an open file, as VS Code does when its tab closes. */
  async closeFile(file: string): Promise<void> {
    await this.request('close', { file });
  }

  /** The codes of the errors of an open file. */
  async errorCodes(file: string): Promise<number[]> {
    const codes: number[] = [];
    for (const command of ['syntacticDiagnosticsSync', 'semanticDiagnosticsSync']) {
      const response = await this.request<ts.server.protocol.SemanticDiagnosticsSyncResponse>(command, { file });
      for (const diagnostic of response.body ?? []) codes.push((diagnostic as ts.server.protocol.Diagnostic).code ?? 0);
    }
    return codes.sort((a, b) => a - b);
  }

  /** The completions at a position of an open file, until the list is complete. */
  async completionsAt(file: string, line: number, offset: number): Promise<readonly CompletionEntry[]> {
    let body: ts.server.protocol.CompletionInfo | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const triggerKind = attempt === 0 ? 1 : 3;
      body = (await this.request<ts.server.protocol.CompletionInfoResponse>('completionInfo', { file, line, offset, triggerKind })).body;
      if (!body?.isIncomplete) break;
    }
    return body?.entries ?? [];
  }

  /** The descriptions of the quick fixes for an error code at a range of one line of an open file. */
  async fixes(file: string, line: number, start: number, end: number, code: number): Promise<string[]> {
    const response = await this.request<ts.server.protocol.CodeFixResponse>('getCodeFixes', {
      file,
      startLine: line,
      startOffset: start,
      endLine: line,
      endOffset: end,
      errorCodes: [code],
    });
    return (response.body ?? []).map((fix) => fix.description);
  }

  close(): void {
    this.child.kill();
  }
}
