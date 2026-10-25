# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.2.1

**`ts --init` gives a project that works.** A `tsconfig.json` decides all
settings, as with `tsc`, so the `tsconfig.json` of `ts --init` lost the
types of `prompt()`, `alert()` and `confirm()`. For Node.js, `ts --init`
now also writes `globals.d.ts` with these types, which the editor, `ts` and
`tsc` read. Without a `package.json` in the folder and above, it writes a
`package.json` with `"type": "module"`, so every file stays an ES module.
When the folder cannot find the types of Node.js, it asks to run
`npm install --save-dev @types/node`. It replaces no existing file.

**A `tsconfig.json` without a `package.json`.** `ts` now finds the type
packages of the project (`node_modules/@types`), as `tsc` and the editor
do; before, it reported error TS2688 for `"types": ["node"]`. A program of
such a project runs, also when `tsc` writes CommonJS. With TypeScript 7,
the check of one file now also reads the declaration files of the project,
as with TypeScript 6.

## 0.2.0

**The command `ts`.** `ts main.ts` checks a TypeScript file with `tsc`,
compiles it and runs it with Node.js, in one step; `ts` alone runs
`main.ts`. The words after the file are the arguments of the program. A
program can use `prompt()`, `alert()` and `confirm()` without an import. A
folder needs no `tsconfig.json` and no `package.json`: `ts` uses the
built-in defaults of `tsc` with the types and the module system of Node.js,
and every file is an ES module. `ts --check` only checks, `ts --init`
writes a `tsconfig.json` (`--browser` for code of the browser),
`ts --install-typescript` installs TypeScript globally, and
`ts --completion bash|zsh|fish` prints the Tab completion. `ts` uses the
TypeScript of the project, else the TypeScript of VS Code in its terminals,
else the global TypeScript, and offers to install one when it finds none.
The extension puts `ts` and its Tab completion into the terminals of
VS Code. `ts` is also the npm package `@nimblescape/typescript`, for
Linux and macOS.

**F5 with the debug type `ts`.** A launch configuration
`{ "type": "ts", "request": "launch", "program": "${file}" }` runs a file
with `ts` in the JavaScript debugger of VS Code, with breakpoints in the
`.ts` files, `stopOnEntry` (a pause at the first statement, as with
`node --inspect-brk`), and `prompt()` in the integrated terminal.
Without a `launch.json`, F5 offers "Run TypeScript file" for the file of
the active editor.

**The settings of `ts` in the editor.** A file without `tsconfig.json`
gets the settings of `ts` instead of those of VS Code, so the editor shows
the errors of `ts`: no types of the browser, the types of Node.js and of
`prompt()`, `alert()` and `confirm()`, and imports with the extension
`.ts`. The project of such a file also holds the other TypeScript files of
its assignment, so an auto-import finds a file that is not open.

**The imports of the assignment.** In a course with many assignments, the
auto-imports and the quick fixes "Add import" offer only the files of the
assignment of the file. The settings
`nimblescape.typescript.assignmentFolders` (default `workspace`) and
`nimblescape.typescript.entryFiles` (default `main.ts`) define the
assignment folders.

## 0.1.0

The first version.

**Auto-imports that a program needs.** A plugin of the TypeScript server
hides the auto-import completions of names that the program can use without
an import: an export whose name is a global name of the file, such as
`parseInt` of `es-toolkit/compat` next to the global `parseInt`, and an
export of a module whose only export is a global object, such as `log` of
`node:console` (`console`) and `exit` of `node:process` (`process`). The
plugin reads the program and uses no list of names. The exports of the files
of the project, of the packages and of the modules of Node.js stay, also
`on` and `once` of `node:events`. The plugin works with the TypeScript of
VS Code and with the TypeScript of the workspace (setting `typescript.tsdk`).

**Install hint.** When the `package.json` file of a folder of the workspace
lists `typescript` and `node_modules/typescript/lib/tsserver.js` is missing,
a hint offers **Run npm ci**, which runs `npm ci` (or `npm install` without
`package-lock.json`) in a terminal in the folder. When TypeScript is
installed, a second hint offers **Reload window**. The hint appears only in a
trusted workspace.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-typescript/blob/main/LICENSE).
