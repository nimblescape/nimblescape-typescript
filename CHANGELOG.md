# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.3.1

**The cleanup of earlier runs deletes only folders of runs.** At its start,
`ts` deletes the folders that earlier runs left in
`node_modules/.cache/ts/`. Up to 0.3.0, it deleted every folder there whose
name started with a number and a dash, also through a symbolic link
`node_modules/.cache/ts` to another folder, where such a folder, for
example `2024-photos`, is no folder of a run. Now it deletes only real
folders with the name of a run. In the temporary folder of the system,
`ts` stops with a message when its folder `nimblescape-ts-<user ID>` is a
symbolic link.

**No slow editor with a wrong assignment folder.** The plugin lists at most
100 folders below an assignment root. A wrong root with many folders and
few TypeScript files, for example a home folder with a `package.json`, made
the TypeScript server list all its folders after each change of a file.

**Smaller fixes.** `ts install` installs only a version number of
TypeScript 6 or newer as the default from the network. The script `ts` of
the extension also works when the folder of the extension holds a `$`, a
quote or a backtick. A folder whose name starts with two dots, such as
`..old`, now counts as inside the assignment root. `ts check` no longer
misreads a `tsconfig.json` with `,}` or `,]` inside a string.

## 0.3.0

**Commands instead of options (not compatible with 0.2).** `ts` now has
command words, as npm has: `ts check [file]`, `ts init`, `ts install` and
`ts completion <shell>`. A command is the first word; every other first
word is the file to run, so `ts main.ts` works as before, and `ts ./check`
runs a file with the name of a command. `--version` and `--help` stay
options. The options of 0.2.0 to 0.2.2 are gone: `--check` is now
`ts check`, `--init` is `ts init`, `--completion` is `ts completion`, and
`--install-typescript` is `ts install --global`. Scripts and texts that
use them must change.

**`ts install` and `ts install --global`.** The new command `ts install`
(short `ts i`) installs what `ts` uses in the current folder, as
`npm install` does. When the nearest `package.json` lists packages, it
runs `npm ci` in its folder (with a `package-lock.json`, otherwise
`npm install`), without a question. Without such a `package.json`, `ts`
uses the global TypeScript, so `ts install` installs that one.
`ts install --global` (short `ts i -g`) always installs the global
TypeScript, also inside a project. In a terminal, both show the list of
versions, with the TypeScript of the newest VS Code selected, so Enter
installs the same version as `ts --install-typescript` did, and Esc
cancels. Without a terminal, for example in a script, they install the
TypeScript of the newest VS Code without a question.

**Upgrade of a global TypeScript that is too old.** When the global
TypeScript is older than TypeScript 6, which `ts` needs, `ts` no longer
only stops with an error. In a terminal, it asks whether to upgrade the
global TypeScript and then shows the list of versions, with the
recommended version selected. npm replaces the old version. Without a
terminal, `ts` stops with the error as before.

## 0.2.2

**A list for the TypeScript to install.** When `ts` finds no TypeScript,
it no longer asks you to type the version number. It shows the versions of
npm from TypeScript 6 on in a list, newest first, with the recommended
version selected: the TypeScript of the newest stable VS Code. The arrow
keys select a version, which is cyan (without color when the variable
`NO_COLOR` is set), Enter installs it globally with npm, and Esc cancels
and prints the command. A long list scrolls. Without a terminal, `ts`
prints the command as before.

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

**Projects of `ts` and standard projects.** A `tsconfig.json` makes its
folder a project of `ts` only when its `compilerOptions.plugins` names the
plugin, as `ts --init` now writes it:
`"plugins": [{ "name": "nimblescape-typescript-plugin" }]`. `tsc` and
Vite ignore the entry. Any other `tsconfig.json` is a standard project,
for example the one of a Vite template: `ts` checks it as `tsc` does, and
the plugin leaves its editor as TypeScript gives it, without the filter of
the auto-imports. So the editor shows the errors that `npm run build`
shows. A folder without `tsconfig.json` is a project of `ts`, as before.
A change of the entry applies in the editor when the TypeScript server
starts again (command "TypeScript: Restart TS Server").

**`prompt()`, `alert()` and `confirm()` in every project of `ts`.**
Before, `ts` and the editor knew the types of the three functions only in
a folder without `tsconfig.json`, so the `tsconfig.json` of `ts --init`
made them unknown names. Now `ts` and the plugin add them to every project
of `ts`, also with a `tsconfig.json`, as Deno has its globals in its
built-in library: the project needs no file for them. A project with the
types of the browser (`"lib"` with `"dom"`, or no `"lib"`) takes them from
the browser types. Plain `tsc` does not know them. In a course with
`@majikmate/ts-utils` and a `tsconfig.json` of `ts --init`, the
auto-import no longer offers its `prompt`, because `prompt` is global.

**Every file is an ES module, also with a `tsconfig.json`.** Without a
`package.json`, `ts` and the plugin now make every file an ES module also
in a project of `ts` with a `tsconfig.json`, as Deno does. Before, `module`
`nodenext` read every file there as CommonJS, so the `tsconfig.json` of
`ts --init` reported error TS1295 for every import. With TypeScript 7,
which cannot use this, such a project needs a real `package.json`.

**`ts --init` gives a project that works.** It writes only the
`tsconfig.json`, with `rewriteRelativeImportExtensions`, so an import names
the `.ts` file also in the editor, and with the entry of the plugin. With
TypeScript 7, it also writes a `package.json` with `"type": "module"` when
the folder and the folders above have none. When the folder cannot find
the types of Node.js, it asks to run `npm install --save-dev @types/node`.
It replaces no existing file.

**`ts --init --browser` is gone.** `ts` is for programs that run in
Node.js. Code for the browser belongs in a Vite project, whose template
brings its own `tsconfig.json`, or in plain JavaScript files.

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
