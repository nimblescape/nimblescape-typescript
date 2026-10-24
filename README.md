# nimblescape TypeScript

Keeps the auto-import completions of TypeScript to the imports that a program needs, and offers to install the packages of a project when its TypeScript is missing.

When you type a name in a TypeScript file, VS Code shows a list of completions. Some entries of the list add an import to the top of the file when you choose them: the auto-imports. TypeScript offers an auto-import for every export of every module that the program can import, also when the program can use the name without an import. With the types of Node.js (`@types/node`), `log` offers `import { log } from 'node:console'`, and `exit` offers `import { exit } from 'node:process'`, although `console.log` and `process.exit` need no import. `parseInt` offers `parseInt` of `es-toolkit/compat` next to the global `parseInt`. A student who chooses such an entry gets an import that the program does not need, and a program that differs from the lessons. This extension hides these entries.

| You type | TypeScript offers | With the extension |
| --- | --- | --- |
| `log`, `warn` | `node:console`, `console` | nothing to import: `console.log` and `console.warn` are global |
| `exit`, `argv`, `env` | `node:process`, `process` | nothing to import: `process.exit`, `process.argv` and `process.env` are global |
| `parseInt` | the global `parseInt`, `es-toolkit/compat` | the global `parseInt` |
| `escape` | the global `escape`, `node:querystring`, `querystring`, `es-toolkit`, `es-toolkit/compat` | the global `escape` |
| `on`, `once` | `node:events`, `node:cluster`, `node:stream`, `node:process` and more | the same modules without `node:process` |
| `Dog` | `./dog.ts` | `./dog.ts` |
| `round` | `es-toolkit`, `es-toolkit/compat` | `es-toolkit`, `es-toolkit/compat` |
| `randomInt` | `node:crypto`, `crypto`, `es-toolkit` | `node:crypto`, `crypto`, `es-toolkit` |
| `existsSync`, `readFileSync` | `node:fs`, `fs` | `node:fs`, `fs` |
| `prompt` | `@majikmate/ts-utils` | `@majikmate/ts-utils` |

The table shows a project with `@types/node`, [es-toolkit](https://es-toolkit.dev) and `@majikmate/ts-utils`, and a file `dog.ts` that exports the class `Dog`: the [examples](https://github.com/nimblescape/nimblescape-typescript/tree/main/examples) of this repository.

## What the extension does on your computer

- **When it works.** The filter of the completions is a plugin of the TypeScript server. The TypeScript extension of VS Code, which is part of VS Code, starts the TypeScript server and loads the plugin into it, for the TypeScript and JavaScript files of every workspace. The plugin runs in the TypeScript of VS Code and in the TypeScript of the workspace (setting `typescript.tsdk`). The extension itself activates when a folder of the workspace has a `package.json` file. It does not run in VS Code for the Web.
- **Completions.** The plugin removes entries from the list of completions. It changes no other answer of the TypeScript server: the errors, the quick fixes, the imports of the entries that stay, and all other features of the editor work as TypeScript gives them. When the filter fails, the list stays complete.
- **Install hint.** In a trusted workspace, the extension reads the `package.json` file of each folder of the workspace. When it lists `typescript` and `node_modules/typescript/lib/tsserver.js` is missing, a hint offers to install the packages. Only a click on **Run npm ci** opens a terminal in the folder and runs `npm ci` there, or `npm install` when the folder has no `package-lock.json`. npm downloads the packages from the npm registry and runs their install scripts, as npm always does. While the file is missing, the extension checks for it every 2 seconds; when it appears, a second hint offers **Reload window**.
- **Files and data.** The extension and the plugin change no file and no setting, write nothing to the disk, and keep nothing after the window closes.
- **Network.** The extension and the plugin make no network connection and collect no telemetry. Only npm uses the network, after a click on **Run npm ci**.
- **Restricted Mode and virtual workspaces.** In Restricted Mode, the extension shows no install hint, because `npm ci` runs the install scripts of the packages. The filter works where the TypeScript extension of VS Code runs in Restricted Mode: VS Code 1.125 runs it there with its own TypeScript, VS Code 1.143 does not run it there. The extension does not run in virtual workspaces.

[Security](https://github.com/nimblescape/nimblescape-typescript/blob/main/docs/security.md#what-the-extension-does-on-your-computer) describes each step and where its protection ends.

## Features

- **Fewer wrong imports.** The completions of a name offer no import when the name is global already, and no import of a module whose only export is a global object, such as `node:console` (`console`) and `node:process` (`process`).
- **No list of names.** The plugin reads the program, as TypeScript sees it: the global names of the file, which come from the `lib` and `types` settings of `tsconfig.json` and from the packages of types, and the modules of the auto-imports. A project with other packages and other settings gets the same rules.
- **The imports that a program needs stay.** The exports of the files of the project, of the packages of `package.json` and of the modules of Node.js stay in the list, also when their names are the names of methods of a global object, such as `on` and `once` of `node:events`.
- **Both TypeScripts.** The plugin works with the TypeScript of VS Code and with the TypeScript of the workspace.
- **Install hint.** A project whose packages are not installed gets a hint with a button that runs `npm ci` in a terminal, and a second hint to reload the window when TypeScript is installed. Without the packages, VS Code falls back to its own TypeScript, and the editor cannot check the imports of the packages.

## Requirements

- VS Code 1.125 or later, with its TypeScript extension "TypeScript and JavaScript Language Features", which VS Code enables by default.
- For the install hint: Node.js with npm on the `PATH` of the terminal.

The tests run with TypeScript 6.0.3, the TypeScript of VS Code 1.125 and later. TypeScript 7 has no `tsserver.js` and loads no plugins: for a project that installs TypeScript 7, VS Code uses its own TypeScript, which loads the plugin.

## Usage

1. Install the extension.
2. Open a folder with a TypeScript project.
3. Type a name in a TypeScript file. The list of completions shows only the auto-imports that the program needs.

When the hint "The packages of the folder … are not installed" appears, click **Run npm ci**. When npm is done, click **Reload window** in the second hint.

The extension has no settings and no commands. To see the hidden entries again, disable the extension for the workspace in the Extensions view, and reload the window.

## Limits

- The plugin hides an export whose name is a global name of the file, also when the export does something else: `escape` of `es-toolkit` escapes HTML, the global `escape` encodes a URL. To use such an export, write its import yourself.
- The plugin filters the list of completions only. When a file uses a name that it does not declare, such as `log('Hello')`, the quick fix of the error still offers "Add import from 'node:console'".

---

[Change log](https://github.com/nimblescape/nimblescape-typescript/blob/main/CHANGELOG.md) · [Contributing](https://github.com/nimblescape/nimblescape-typescript/blob/main/CONTRIBUTING.md) · [Support](https://github.com/nimblescape/nimblescape-typescript/blob/main/SUPPORT.md) · [Issues](https://github.com/nimblescape/nimblescape-typescript/issues) · [Source](https://github.com/nimblescape/nimblescape-typescript)

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](https://github.com/nimblescape/nimblescape-typescript/blob/main/LICENSE).
