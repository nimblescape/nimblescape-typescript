# Security model

This document describes what nimblescape TypeScript does on your computer, what it protects, how, and where its protection ends. How the parts work together is in [architecture.md](architecture.md).

## What the extension does on your computer

The README and the Marketplace page list these behaviors at the top. Each item links to its details.

- **When it works.** The extension activates after the start of VS Code in every window (`onStartupFinished`) and for a debug session of the type `ts`. The plugin `nimblescape-typescript-plugin` runs in the TypeScript server that the TypeScript extension of VS Code starts for the TypeScript and JavaScript files of every workspace, with the TypeScript of VS Code or of the workspace (setting `typescript.tsdk`). See [The plugin](#the-plugin).
- **Terminals.** The extension adds a folder with `ts` to the end of `PATH` of the terminals of VS Code, and sets `NIMBLESCAPE_TS_TYPESCRIPT`, `NIMBLESCAPE_TS_TYPES`, `XDG_DATA_DIRS` and `FPATH`. See [The terminals](#the-terminals).
- **Programs.** `ts` and the debug type `ts` run your program with Node.js and the rights of your user. `ts` asks before it runs `npm ci` or `npm install`. See [The command ts](#the-command-ts) and [The debug type](#the-debug-type).
- **Editor.** The plugin gives a TypeScript file without `tsconfig.json` the settings of `ts`, adds the TypeScript files of its assignment folder to its project, and removes entries from the completions and the quick fixes "Add import". A project whose `tsconfig.json` does not name the plugin, for example a Vite project, keeps what TypeScript gives it. See [The plugin](#the-plugin).
- **No pop-ups.** The extension shows no notification: it never asks and never offers anything in a pop-up. `ts` asks its questions in the terminal.
- **Files and data.** The extension writes the script `ts` and the Tab completion scripts into its storage folder. `ts` writes the folder of each run and deletes it after the run. See [Stored data](#stored-data).
- **Network.** The extension and the plugin make no network connection and collect no telemetry. `ts` connects to the internet only to install TypeScript, and npm downloads packages after your answer in the terminal. See [Network](#network).

## The trust model

**Your program runs with your rights.** `ts main.ts` and F5 run the program with Node.js, as `node` does in a terminal: it can read, change and delete your files, connect to any address, and read the environment variables. `ts` adds no right and removes none. Run only programs that you trust.

**The extension starts no program of the workspace without your action.** The plugin runs inside the TypeScript server, which reads the files of the workspace anyway. The extension reads files and sets the environment of the terminals. A program of the workspace runs only when you type `ts`, press F5 or answer `y` to a question of `ts`.

**`npm ci` runs the code of the packages.** npm downloads the packages that `package.json` and `package-lock.json` name, and runs their install scripts with the rights of your user. This is what `npm ci` always does in a terminal; `ts` adds no right and removes none. Install the packages only of a project whose packages you trust, for example the template repository of a course.

## Trust boundaries

| Part | Runs as | Trusts |
| --- | --- | --- |
| The extension (`dist/extension.js`) | Your user, in the extension host of VS Code | VS Code |
| The plugin (`dist/plugin.js`) | Your user, in the process of the TypeScript server | The TypeScript server and its TypeScript module, and the program that the server builds from the files of the workspace |
| The command `ts` (`cli/dist/ts.js`) | Your user, in a terminal or a debug session | The TypeScript that it finds (see [The command ts](#the-command-ts)), the `tsconfig.json` and `package.json` files of the project, and the program that you run |
| The program, npm and the install scripts of the packages | Your user | Nothing: it is your code and the code of the packages |

## Workspace trust

The manifest declares `untrustedWorkspaces: "limited"`, because VS Code starts no debug session in Restricted Mode. The extension activates there and works as in a trusted workspace otherwise.

The terminals of VS Code get `ts` also in Restricted Mode. `ts` runs only when you type it, as any other command of the terminal.

The plugin only reads the program that the TypeScript server builds and the names of the TypeScript files of the assignment folders, so it may run in Restricted Mode. It runs there when the TypeScript extension of VS Code runs there: VS Code 1.125 runs the TypeScript extension in Restricted Mode with its own TypeScript, never with the TypeScript of the workspace, so no code of the workspace runs in the TypeScript server. VS Code 1.143 does not run the TypeScript extension in Restricted Mode, so no TypeScript server and no plugin run there.

A trusted workspace can name its own TypeScript with `typescript.tsdk`. VS Code then runs the `tsserver.js` file of the workspace, which is code of the workspace, and loads the plugin into it. The plugin has no protection against a TypeScript server that is not TypeScript, and needs none: such a server runs with your rights already.

## The terminals

At its start, the extension writes three files into its storage folder of VS Code (`globalStorageUri`): `bin/ts`, a shell script that runs `node <folder of the extension>/cli/dist/ts.js` with its arguments, and the Tab completion scripts `completion/bash-completion/completions/ts` and `completion/zsh/_ts`. The texts of these files come from the extension only. It writes a file only when its text changed.

It then sets the environment of the terminals of VS Code with `environmentVariableCollection`:

| Variable | Change |
| --- | --- |
| `PATH` | Ends with the folder `bin/` of the storage folder. A program of the same name earlier on the `PATH`, for example a global `ts` of npm, comes first. |
| `NIMBLESCAPE_TS_TYPESCRIPT` | The folder of the TypeScript of VS Code, or of the user setting `js/ts.tsdk.path` (`typescript.tsdk`). A workspace setting is not read. |
| `NIMBLESCAPE_TS_TYPES` | The folder `cli/` of the extension. |
| `XDG_DATA_DIRS` | Ends with the folder `completion/` of the storage folder. |
| `FPATH` | Ends with the folder `completion/zsh/`. When `FPATH` is not set in the extension host, the extension runs `zsh -fc 'print -r -- $FPATH'` once, which reads no start file of the user, to keep the folders of zsh. |

The extension changes no start file of a shell and no setting.

## The command ts

What it does:

- It finds the nearest `tsconfig.json` and `package.json` above the file, and the TypeScript of the project (from `node_modules/typescript` when `package.json` lists `typescript`), else the TypeScript in `NIMBLESCAPE_TS_TYPESCRIPT`, else the global TypeScript of npm. The TypeScript of the project is code of the project: `ts` runs it, as `npx tsc` would.
- When `package.json` lists packages that are not installed, it asks whether to run `npm ci` (with `package-lock.json`) or `npm install`, in the folder of `package.json`. Without a terminal for the question, it prints the command and runs nothing.
- When it finds no TypeScript, it shows a list of versions, and runs `npm install --global typescript@<version>` for the version that you select and confirm with Enter; Esc cancels. When the global TypeScript is older than TypeScript 6, it first asks whether to upgrade it, then shows the same list. `ts --install-typescript` shows the same list; without a terminal, it runs the command for the default version without a question. The version is a version of the npm list, or the default (see [Network](#network)).
- It writes a temporary `tsconfig.json` and the compiled files into the folder of the run, runs `tsc` with it, and then `node --enable-source-maps --import <polyfill of ts> <compiled file> <arguments>` in the folder where you started `ts`. After the run, it deletes the folder of the run, and the folders that it created for it when they are empty.
- `ts --init` writes `tsconfig.json` into the current folder, and refuses to replace an existing one. `ts --completion` only prints text.

What it does not do:

- It changes no file of the project except the folder of the run in `node_modules/.cache/ts/`, and `tsconfig.json` after `ts --init`.
- It runs no program without your command, except `npm` after your answer, and the TypeScript and Node.js of the run.

Where its protection ends:

- The folder of the runs in the temporary folder of the system, `nimblescape-ts-<user ID>`, is for your user only, so no other user of the computer can change the compiled files between the check and the run: `ts` creates it with the mode `700`, sets that mode when the folder has another one, and stops when the folder belongs to another user. Another user can create that folder first, and then `ts` stops with a message until the folder is deleted. In a project, the folder of the runs lies in `node_modules/.cache/ts/` and has the rights of `node_modules`.
- When `ts` ends without its cleanup, for example after `kill -9`, the folder of the run stays until the next `ts` of the same project.
- The polyfills read the keyboard with `readSync` on the standard input; they have no protection against a program that changes the standard input itself.

## The debug type

The debug type `ts` turns a launch configuration into one of the JavaScript debugger of VS Code (js-debug) with `runtimeExecutable` set to `ts`: the global `ts` of npm, when the file `ts` on the `PATH` of the extension host is a link to `@nimblescape/typescript/dist/ts.js`, else `bin/ts` of the storage folder. js-debug starts `ts` and attaches to `ts` and to the program, which run with your rights, as from a terminal. The configuration adds `NIMBLESCAPE_TS_DEBUG` to their environment; `ts` removes it from the environment of the program.

With `stopOnEntry`, `NIMBLESCAPE_TS_DEBUG` is `stop-on-entry`, and `ts` loads `stop-on-entry.mjs` before the program. It changes only the main module, in memory, as Node.js loads it: an ES module gets the import of `pause.mjs` at its end, and the code of a CommonJS module runs in an inner function. Both call `callAndPauseOnStart` of the inspector binding of Node.js (`process.binding('inspector')`), the call that `node --inspect-brk` makes; it pauses only for a debugger that is attached. The compiled files on disk stay as `tsc` wrote them.

Stop and Restart end the program with SIGTERM (`killBehavior` `polite`), so `ts` deletes the folder of the run. A program that ignores SIGTERM keeps running; VS Code's red Stop button then has no effect on it, and `kill -9` in a terminal ends it, as for any process.

The attributes of the configuration in `launch.json` win over the values of the debug type, as for any debug type of VS Code.

## The plugin

The TypeScript server loads the plugin with `require()` from `node_modules/nimblescape-typescript-plugin` of the folder of the extension, because the TypeScript extension of VS Code passes the name of the plugin with `--globalPlugins` and the folder of the extension with `--pluginProbeLocations`. `node_modules/nimblescape-typescript-plugin/package.json` names `dist/plugin.js` of the extension as its main file, so the server loads only files of the extension.

What it does:

- It wraps the language service of each inferred project and of each project of `ts`, and forwards every request unchanged, except `getCompletionsAtPosition` and `getCodeFixesAtPosition`. A project of `ts` has a `tsconfig.json` whose `compilerOptions.plugins` names the plugin, as `ts --init` writes it. The plugin returns the language service of any other project with a `tsconfig.json` unchanged.
- For an inferred project (open files without `tsconfig.json`) with an open TypeScript file, it replaces the compiler options that VS Code sends with the defaults of `ts`, whose types come from the folder `cli/` of the extension. An inferred project with only JavaScript files keeps the options of VS Code. It answers a `package.json` `{"type": "module"}` at the root of the file system when that file does not exist. It adds the names of the TypeScript files of the assignment roots of the open files to the project, up to 300 for one root: it lists the folders below the root, without `node_modules` and hidden folders, and the TypeScript server reads the files.
- For a project of `ts` with `tsconfig.json`, it keeps the compiler options of the project. It adds the types of `prompt()`, `alert()` and `confirm()` as one more file, unless the project has the types of the browser, and it answers the same `package.json` `{"type": "module"}` as for an inferred project.
- In an inferred project with an open TypeScript file and in a project of `ts`, of the answer to `getCompletionsAtPosition`, it removes the auto-import entries of names that are global in the file, of modules whose `export =` export is a global variable, and of files of the student outside the assignment root of the file. Of the answer to `getCodeFixesAtPosition`, it removes the fixes "Add import" of files outside the assignment root.
- To find the repository root, it checks whether a folder `.git` exists above a file, when the extension sent no open folder around it.
- It writes one line to the log of the TypeScript server for each project (with the name of the project, which is the path of its `tsconfig.json` file or of the inferred project), one line for the defaults of an inferred project, one line each time an inferred project changes between the defaults of `ts` and the options of VS Code, and one line when a filter fails.

What it does not do:

- It starts no process and makes no network connection. It reads no file itself; it lists folders and checks whether files exist.
- It changes no other answer: the errors of a project with `tsconfig.json`, the hover texts, the imports of the entries that stay, and the edits of a refactoring stay as TypeScript gives them. The errors of an inferred project follow the defaults of `ts`.
- It keeps no state between two requests, except the settings that the extension sent and, for an inferred project, the last options of VS Code and whether an open file is a TypeScript file.

Where its protection ends:

- When a filter throws an error, the plugin returns the answer of the TypeScript server without a change, so the list of completions and the quick fixes stay complete. When the defaults fail, the inferred project keeps the options of VS Code.
- A wrong assignment root, for example a folder `workspace` high above the files, can add up to 300 files to an inferred project, which costs memory and time in the TypeScript server.
- The plugin calls `getPackageJsonAutoImportProvider` of the project, a method of the TypeScript server that is not part of its public API. When a TypeScript has no such method, the plugin leaves the auto-imports of packages that the program does not import yet unchanged for rule 2.

## Network

The extension and the plugin make no network connection and collect no telemetry.

`ts` connects to the internet only to install TypeScript, when it finds none, when you upgrade a global TypeScript older than TypeScript 6, or after `ts --install-typescript`. It reads, over HTTPS, with a timeout:

| Address | What `ts` reads |
| --- | --- |
| `https://update.code.visualstudio.com/api/releases/stable` | The version of the newest stable VS Code. |
| `https://raw.githubusercontent.com/microsoft/vscode/<version>/extensions/package-lock.json` | The TypeScript of that VS Code, the default of the question. |
| `https://registry.npmjs.org/typescript` | The versions of TypeScript that the question lists (only in a terminal). |

Offline, the default is the TypeScript of VS Code when this version of `ts` was built, and `ts` lists no versions. `ts` sends no data of your computer and no file. npm then downloads TypeScript or the packages of the project from the registry that its configuration names.

## Stored data

| Data | Where | How long |
| --- | --- | --- |
| The script `ts` and the Tab completion scripts | The storage folder of the extension (`globalStorageUri`) | Until the extension is removed |
| The environment of the terminals | `environmentVariableCollection` of VS Code | Until the extension is removed |
| The folder of a run | `node_modules/.cache/ts/` of the project, or `nimblescape-ts-<user ID>/` in the temporary folder of the system | Until the run ends |
| The settings of the assignment roots | The memory of the TypeScript server | Until the TypeScript server ends |
| The terminal of the install | VS Code | Until you close it |

The extension and the plugin use neither `globalState` nor `workspaceState` of VS Code, store no secret, and change no setting.

## Known limits

- Your program and `npm ci` run with your rights (see [The trust model](#the-trust-model)).
- The TypeScript of a project is code of the project, which `ts` runs (see [The command ts](#the-command-ts)).
- The plugin runs in the TypeScript server of a trusted workspace that names its own TypeScript with `typescript.tsdk`; that TypeScript is code of the workspace (see [Workspace trust](#workspace-trust)).
- Another user of the computer can block `ts` for files without `package.json` with a folder of the same name in the temporary folder of the system (see [The command ts](#the-command-ts)).
- The plugin uses one method of the TypeScript server that is not part of its public API (see [The plugin](#the-plugin)).

## Security problems

Do not report a security problem in a public issue. Write an e-mail to scalarion@nimblescape.com instead.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](../LICENSE).
