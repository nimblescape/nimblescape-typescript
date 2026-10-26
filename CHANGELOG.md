# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.2.1

**JavaScript files keep the settings of VS Code.** Before, the plugin gave
every file without `tsconfig.json` the settings of `ts`, so the script of
a web page lost the types of the browser: `document.` offered no
completions. Now the settings of `ts` apply only while a TypeScript file
without `tsconfig.json` is open; JavaScript files alone keep the settings
of VS Code. VS Code puts the open files without `tsconfig.json` of one
folder into one project, so a TypeScript file that is open makes its
JavaScript files use the settings of `ts` until it closes. JavaScript
files alone also keep the completions of VS Code: the filter of the
auto-imports applies only with the settings of `ts`, so in a Vite project
with JavaScript, the icons `Map` and `Image` of lucide-react stay
auto-imports.

**`ts` runs JavaScript files.** `ts main.js` checks the syntax of a
JavaScript file with `tsc` and runs it with Node.js, as `ts main.ts` does,
also when a `tsconfig.json` does not allow JavaScript. As in `tsc` and
Deno, `tsc` checks the types of a JavaScript file only with the comment
`// @ts-check`. A TypeScript file may import a JavaScript file.

**`prompt()`, `alert()` and `confirm()` in every project.** Before, `ts`
and the editor knew the types of the three functions only in a folder
without `tsconfig.json`, so a `tsconfig.json`, for example the one of
`ts --init`, made them unknown names. Now `ts` and the plugin add them to
every project, also with a `tsconfig.json`, as Deno has its globals in its
built-in library: the project needs no file for them. A project with the
types of the browser (`"lib"` with `"dom"`, or no `"lib"`) takes them from
the browser types. Plain `tsc` does not know them. In a course with
`@majikmate/ts-utils` and a `tsconfig.json`, the auto-import no longer
offers its `prompt`, because `prompt` is global.

**Every file is an ES module, also with a `tsconfig.json`.** Without a
`package.json`, `ts` and the plugin now make every file an ES module also
in a project with a `tsconfig.json`, as Deno does. Before, `module`
`nodenext` read every file there as CommonJS, so the `tsconfig.json` of
`ts --init` reported error TS1295 for every import. With TypeScript 7,
which cannot use this, such a project needs a real `package.json`.

**`ts --init` gives a project that works.** It writes only the
`tsconfig.json`, with `rewriteRelativeImportExtensions`, so an import names
the `.ts` file also in the editor. With TypeScript 7, it also writes a
`package.json` with `"type": "module"` when the folder and the folders
above have none. When the folder cannot find the types of Node.js, it asks
to run `npm install --save-dev @types/node`. It replaces no existing file.

**A `tsconfig.json` without a `package.json`.** `ts` now finds the type
packages of the project (`node_modules/@types`), as `tsc` and the editor
do; before, it reported error TS2688 for `"types": ["node"]`. A program of
such a project runs, also when its `module` makes `tsc` write CommonJS. A
project with a
`package.json` still finds a package that `"types"` names, such as
`vite/client`. With TypeScript 7,
the check of one file now also reads the declaration files of the project,
as with TypeScript 6.

**The extension shows no pop-up.** The notification "Run npm ci" is
gone: it was made for courses that set `typescript.tsdk`, and it also
appeared in every Vite project before `npm install`. A launch
configuration of type `ts` without `"request": "launch"` now opens
`launch.json` instead of an error message. The extension also no longer
starts for every folder with a `package.json`.

**Smaller fixes.** The message about packages that are not installed says
"in this folder" instead of "in .".

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
