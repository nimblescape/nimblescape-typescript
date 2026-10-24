# Security model

This document describes what nimblescape TypeScript does on your computer, what it protects, how, and where its protection ends. How the parts work together is in [architecture.md](architecture.md).

## What the extension does on your computer

The README and the Marketplace page list these behaviors at the top. Each item links to its details.

- **When it works.** The plugin `nimblescape-typescript-plugin` runs in the TypeScript server that the TypeScript extension of VS Code starts for the TypeScript and JavaScript files of every workspace, with the TypeScript of VS Code or of the workspace (setting `typescript.tsdk`). The extension itself activates when a folder of the workspace has a `package.json` file (`workspaceContains:package.json`). See [The plugin](#the-plugin).
- **Completions.** The plugin removes auto-import entries from the answer of the TypeScript server to a completion request, and changes no other answer. See [The plugin](#the-plugin).
- **Install hint.** In a trusted workspace, the extension reads the `package.json` file of each folder of the workspace, and checks whether `node_modules/typescript/lib/tsserver.js` exists. Only a click on **Run npm ci** opens a terminal in the folder and runs `npm ci` there, or `npm install` without a `package-lock.json`. While the file is missing, the extension checks for it every 2 seconds. See [The install hint](#the-install-hint).
- **Files and data.** The extension and the plugin change no file and no setting, and keep their state in memory only. See [Stored data](#stored-data).
- **Network.** The extension and the plugin make no network connection and collect no telemetry. npm downloads packages after a click on **Run npm ci**. See [The install hint](#the-install-hint).

## The trust model

**The extension starts nothing without a click.** The plugin runs inside the TypeScript server, which reads the files of the workspace anyway. The extension reads files and shows hints. The only program that the extension starts is `npm ci` or `npm install`, in a terminal, after a click on **Run npm ci**.

**`npm ci` runs the code of the packages.** npm downloads the packages that `package.json` and `package-lock.json` name, and runs their install scripts with the rights of your user. A package can read, change and delete your files, connect to any address, and read the environment variables of the terminal. This is what `npm ci` always does in a terminal; the extension adds no right and removes none. Click **Run npm ci** only in a project whose packages you trust, for example the template repository of a course.

## Trust boundaries

| Part | Runs as | Trusts |
| --- | --- | --- |
| The extension (`dist/extension.js`) | Your user, in the extension host of VS Code | VS Code, and the `package.json` file of a trusted workspace, which it only parses as JSON |
| The plugin (`dist/plugin.js`) | Your user, in the process of the TypeScript server | The TypeScript server and its TypeScript module, and the program that the server builds from the files of the workspace |
| npm and the install scripts of the packages | Your user, in a terminal | Nothing: it is the code of the packages |

## Workspace trust

The manifest declares `untrustedWorkspaces: "limited"`. In Restricted Mode, the extension activates, but shows no install hint and watches no file, because `npm ci` runs the install scripts of the packages, and the name of a package and of its scripts come from the files of the workspace. When you trust the workspace, the extension checks the folders and shows the hint.

The plugin only reads the program that the TypeScript server builds, so it may run in Restricted Mode. It runs there when the TypeScript extension of VS Code runs there: VS Code 1.125 runs the TypeScript extension in Restricted Mode with its own TypeScript, never with the TypeScript of the workspace, so no code of the workspace runs in the TypeScript server. VS Code 1.143 does not run the TypeScript extension in Restricted Mode, so no TypeScript server and no plugin run there.

A trusted workspace can name its own TypeScript with `typescript.tsdk`. VS Code then runs the `tsserver.js` file of the workspace, which is code of the workspace, and loads the plugin into it. The plugin has no protection against a TypeScript server that is not TypeScript, and needs none: such a server runs with your rights already.

## The plugin

The TypeScript server loads the plugin with `require()` from `node_modules/nimblescape-typescript-plugin` of the folder of the extension, because the TypeScript extension of VS Code passes the name of the plugin with `--globalPlugins` and the folder of the extension with `--pluginProbeLocations`. `node_modules/nimblescape-typescript-plugin/package.json` names `dist/plugin.js` of the extension as its main file, so the server loads only files of the extension.

What it does:

- It wraps the language service of each project of the TypeScript server, and forwards every request unchanged, except `getCompletionsAtPosition`.
- Of the answer to `getCompletionsAtPosition`, it removes the auto-import entries of names that are global in the file, and of modules whose `export =` export is a global variable. It reads the names with the type checker of the program, and the modules of the entries from the program or from the program of the package.json imports of the TypeScript server.
- It writes one line to the log of the TypeScript server for each project (with the name of the project, which is the path of its `tsconfig.json` file), and one line when the filter fails.

What it does not do:

- It starts no process, opens no file itself, and makes no network connection. It reads only what the TypeScript server has read already.
- It changes no other answer: the errors, the quick fixes, the hover texts, the imports of the entries that stay, and the edits of a refactoring stay as TypeScript gives them.
- It keeps no state between two requests.

Where its protection ends:

- When the filter throws an error, the plugin returns the answer of the TypeScript server without a change, so the list of completions stays complete.
- The plugin calls `getPackageJsonAutoImportProvider` of the project, a method of the TypeScript server that is not part of its public API. When a TypeScript has no such method, the plugin leaves the auto-imports of packages that the program does not import yet unchanged for rule 2.

## The install hint

The extension reads two files of each folder of a trusted workspace: `package.json`, which it parses as JSON for the fields `dependencies`, `devDependencies` and `optionalDependencies`, and `node_modules/typescript/package.json`, for the version of an installed TypeScript. It checks whether `package-lock.json`, `node_modules/typescript/lib/tsserver.js` and the lock files of Yarn, pnpm and Bun exist. It reads no other file.

The hint names the folder and the command. A click on **Run npm ci** opens a terminal with the folder as its working folder and sends the text `npm ci` (or `npm install`) to it. The command is one of these two fixed texts: no part of it comes from a file of the workspace. The program that the terminal runs for `npm` is the one on the `PATH` of the terminal, as when you type the command yourself. A second click shows the same terminal while it is open, and does not run the command again.

While `tsserver.js` is missing, the extension watches for it with a file watcher and checks for it every 2 seconds. When it appears, a second hint offers **Reload window**, which runs the command `workbench.action.reloadWindow` of VS Code. The extension stops the watcher and the timer when the file appears, when `package.json` no longer lists `typescript`, and when the folder leaves the workspace.

The extension skips a folder that uses another package manager: a folder with the lock file of Yarn, pnpm or Bun and without `package-lock.json`.

## Stored data

| Data | Where | How long |
| --- | --- | --- |
| The state of the hint of each folder | The memory of the extension host | Until the window closes or reloads |
| The terminal of the install | VS Code | Until you close it |

The extension and the plugin write no file, use neither `globalState` nor `workspaceState` of VS Code, store no secret, and send nothing to any address. They have no settings.

## Known limits

- `npm ci` runs the install scripts of the packages with your rights (see [The trust model](#the-trust-model)).
- The plugin runs in the TypeScript server of a trusted workspace that names its own TypeScript with `typescript.tsdk`; that TypeScript is code of the workspace (see [Workspace trust](#workspace-trust)).
- The plugin uses one method of the TypeScript server that is not part of its public API (see [The plugin](#the-plugin)).

## Security problems

Do not report a security problem in a public issue. Write an e-mail to scalarion@nimblescape.com instead.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](../LICENSE).
