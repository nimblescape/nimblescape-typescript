// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The repair path: a hint for each folder of the workspace whose package.json lists typescript, but whose
// node_modules/typescript/lib/tsserver.js is missing (installCheck.ts). The hint offers to run npm ci (npm install
// without package-lock.json) in a terminal in the folder. While the file is missing, the extension watches for it, also
// when the user installs the packages in another way. When the file appears, a second hint offers to reload the
// window, so that the TypeScript extension of VS Code starts the TypeScript server of the folder.

import * as vscode from 'vscode';
import { TSSERVER, installCommand, installState, type InstallState } from './installCheck.ts';

/** The state of the hint of a folder: the state of the check, or `reload` after the TypeScript server appeared. */
export type HintState = InstallState | 'reload';

/**
 * How often the extension checks again for the TypeScript server of a folder while it is missing, in milliseconds. The
 * file watcher of VS Code may report the file late, or not at all (a watcher in node_modules, which
 * files.watcherExclude excludes, or a container without free inotify watches), so the check also runs on a timer.
 */
export const POLL_INTERVAL = 2000;

/** The hints of all folders of the workspace. */
export class InstallHints implements vscode.Disposable {
  private readonly hints = new Map<string, FolderHint>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.checkAll()),
      // In Restricted Mode, the extension offers no npm ci, because npm ci runs the install scripts of the packages.
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.checkAll()),
    );
  }

  /** Checks every folder of the workspace, and forgets the folders that the workspace no longer has. */
  checkAll(): void {
    const folders = vscode.workspace.isTrusted ? (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file') : [];
    const paths = new Set(folders.map((folder) => folder.uri.fsPath));
    for (const [folderPath, hint] of this.hints) {
      if (!paths.has(folderPath)) {
        hint.dispose();
        this.hints.delete(folderPath);
      }
    }
    for (const folder of folders) {
      let hint = this.hints.get(folder.uri.fsPath);
      if (!hint) {
        hint = new FolderHint(folder);
        this.hints.set(folder.uri.fsPath, hint);
      }
      hint.check();
    }
  }

  /** The state of the hint of each folder, by the path of the folder. */
  states(): Record<string, HintState> {
    return Object.fromEntries([...this.hints].map(([folderPath, hint]) => [folderPath, hint.state]));
  }

  dispose(): void {
    for (const hint of this.hints.values()) hint.dispose();
    this.hints.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

/** The hint of one folder. */
class FolderHint implements vscode.Disposable {
  state: HintState = 'none';
  /** Checks the folder again when its package.json changes, for example after a pull that adds typescript. */
  private readonly manifestWatcher: vscode.FileSystemWatcher;
  /** The watcher and the timer that wait for the TypeScript server while it is missing. */
  private waiting: { watcher: vscode.FileSystemWatcher; timer: ReturnType<typeof setInterval> } | undefined;
  /** The terminal of the install, while it is open, so that a second click shows it instead of a second install. */
  private terminal: vscode.Terminal | undefined;
  private readonly closeListener: vscode.Disposable;

  constructor(private readonly folder: vscode.WorkspaceFolder) {
    this.manifestWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'package.json'));
    const check = () => this.check();
    this.manifestWatcher.onDidCreate(check);
    this.manifestWatcher.onDidChange(check);
    this.manifestWatcher.onDidDelete(check);
    this.closeListener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === this.terminal) this.terminal = undefined;
    });
  }

  /** Checks the folder and shows a hint when its state changes. */
  check(): void {
    // After the TypeScript server appeared, only a reload of the window helps.
    if (this.state === 'reload') return;
    const state = installState(this.folder.uri.fsPath);
    if (state === this.state) return;
    const before = this.state;
    this.state = state;
    if (state === 'missing') {
      this.wait();
      void this.showMissing();
      return;
    }
    this.stopWaiting();
    if (before === 'missing' && state === 'installed') {
      this.state = 'reload';
      void this.showReload();
    }
  }

  private async showMissing(): Promise<void> {
    const command = installCommand(this.folder.uri.fsPath);
    const run = `Run ${command}`;
    const choice = await vscode.window.showWarningMessage(
      `The packages of the folder ${this.folder.name} are not installed: its package.json lists typescript, but ` +
        `${TSSERVER} is missing. Without them, the editor cannot check the imports of the packages. ` +
        `Install them with ${command}.`,
      run,
    );
    if (choice === run && this.state === 'missing') this.install(command);
  }

  private install(command: string): void {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal({ name: `${command} (${this.folder.name})`, cwd: this.folder.uri });
      this.terminal.sendText(command);
    }
    this.terminal.show();
  }

  private async showReload(): Promise<void> {
    const reload = 'Reload window';
    const choice = await vscode.window.showInformationMessage(
      `TypeScript is installed in the folder ${this.folder.name} now. Reload the window, so that the editor uses it.`,
      reload,
    );
    if (choice === reload) await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }

  /** Watches for the TypeScript server of the folder, with a file watcher and a timer. */
  private wait(): void {
    if (this.waiting) return;
    const lib = vscode.Uri.joinPath(this.folder.uri, 'node_modules', 'typescript', 'lib');
    // A watcher with its own base folder also reports changes in node_modules, which the watcher of the workspace
    // excludes (files.watcherExclude).
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(lib, 'tsserver.js'), false, true, true);
    watcher.onDidCreate(() => this.check());
    this.waiting = { watcher, timer: setInterval(() => this.check(), POLL_INTERVAL) };
  }

  private stopWaiting(): void {
    if (!this.waiting) return;
    this.waiting.watcher.dispose();
    clearInterval(this.waiting.timer);
    this.waiting = undefined;
  }

  dispose(): void {
    this.stopWaiting();
    this.manifestWatcher.dispose();
    this.closeListener.dispose();
  }
}
