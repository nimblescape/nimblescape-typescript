# @nimblescape/typescript

The command `ts` runs a TypeScript file with Node.js. It checks the file
with `tsc`, the TypeScript compiler, compiles it and runs the JavaScript with
Node.js, in one step: `ts main.ts`. A program can use `prompt()`, `alert()`
and `confirm()` as in the browser, without an import. A folder needs no
`tsconfig.json` and no `package.json`.

![VS Code with a terminal, in six scenes: npm installs @nimblescape/typescript globally; ts runs main.ts, and ts main.ts 3 gives the program the argument 3; ts broken.ts stops at a type error, and ts check checks main.ts; ts init writes the tsconfig.json of a project of ts, with the entry of the plugin, and installs the types of Node.js after a question; ts install outside a project lists the versions of TypeScript with the TypeScript of the newest VS Code selected, the arrow keys move the selection, and Enter installs the selected version; ts install in the project runs npm ci; ts --version prints the versions; ts completion bash turns on the Tab completion, Tab Tab lists the commands and the files, and ts --help prints the help; a blue band above the window names each scene, and a label at the bottom names a pressed key and what it does](https://raw.githubusercontent.com/nimblescape/nimblescape-typescript/main/docs/images/ts.gif)

`ts` is a small wrapper around `tsc` and `node`. Every error comes from
`tsc` or from Node.js, and the only addition to Node.js is the three
functions `prompt()`, `alert()` and `confirm()`.

## Install

```sh
npm install --global @nimblescape/typescript
```

`ts` needs Node.js 22 or newer and TypeScript 6 or newer. When `ts` finds no
TypeScript, it offers to install one globally with npm (see
[Which TypeScript](#which-typescript)). `ts install` installs what `ts`
uses in the current folder: the packages of the project, or else TypeScript
globally with the same list. `ts install --global` always installs
TypeScript globally.

`ts` works on Linux and macOS. On Windows, use it in WSL.

The VS Code extension
[nimblescape TypeScript](https://marketplace.visualstudio.com/items?itemName=nimblescape.nimblescape-typescript)
contains the same `ts`: it puts `ts` into the terminals of VS Code, runs a
file with F5, and gives the editor the same settings as `ts`. A global `ts`
comes first in these terminals.

## Usage

```sh
ts                   # runs main.ts of this folder
ts dice.ts 3 6       # runs dice.ts with the arguments 3 and 6
ts check main.ts     # checks main.ts and runs nothing
ts main.js           # runs a JavaScript file in the same way
ts install           # installs the packages of this project
```

| Command | Effect |
| --- | --- |
| `ts [file] [arguments]` | Checks the file with `tsc`, compiles it and runs it with Node.js. Without a file, `ts` runs `main.ts` of the current folder. The words after the file are the arguments of the program (`process.argv`). When `tsc` finds an error, `ts` prints it and runs nothing. |
| `ts check [file]` | Checks the file and runs nothing. Without a file, `ts` checks `main.ts` of the current folder, and without `main.ts` the project of the `tsconfig.json` of the current folder. A project with `references`, such as a Vite project, is checked as `tsc --build` checks it, so `tsc` writes what its `tsconfig` files say: in a Vite project only the `.tsbuildinfo` files in `node_modules/.tmp/`, in a project without `noEmit` also the compiled files. |
| `ts init` | Writes a `tsconfig.json` into the current folder: the file of `tsc --init`, with the settings for Node.js (`lib` `esnext`, the types of Node.js and `rewriteRelativeImportExtensions`), with the entry `"plugins": [{ "name": "nimblescape-typescript-plugin" }]`, which marks a project of `ts` (see [Projects with a tsconfig.json](#projects-with-a-tsconfigjson)), and without `noUncheckedIndexedAccess`. When the folder cannot find the types of Node.js, it also writes a `package.json` with `"type": "module"` (when the folder and the folders above have none) and asks to run `npm install --save-dev @types/node`, which adds the types to that file: a `package.json` that npm writes itself has no `"type"`, which would make every file CommonJS. With TypeScript 7, it always writes that `package.json` when there is none (see [Limits](#limits)). It replaces no existing file. |
| `ts install`, `ts i` | Installs what `ts` uses in the current folder. When the nearest `package.json` lists packages, it runs `npm ci` in its folder (with a `package-lock.json`, else `npm install`), without a question (see [Packages](#packages)). Without such a `package.json`, it installs TypeScript globally as `ts install --global` does. |
| `ts install --global`, `ts i -g` | In a terminal, shows the list of versions (see [Which TypeScript](#which-typescript)) and installs the selected one globally with `npm install --global typescript@<version>`; Esc cancels. Without a terminal, it installs the TypeScript of the newest VS Code without a question. It works the same inside a project. |
| `ts completion <shell>` | Prints the Tab completion script for `bash`, `zsh` or `fish` (see [Tab completion](#tab-completion)). |
| `ts --version`, `ts -v` | Prints the versions of `ts`, of the TypeScript that `ts` uses and of Node.js. |
| `ts --help`, `ts -h` | Prints the help. |

A command (`check`, `init`, `install` or `i`, `completion`) is the first
word, as with npm. Every other first word is the file to run, so
`ts ./check` runs a file with the name of a command. The options stand
before the file; every word after the file goes to the program, also a word
that starts with `-`. `--` ends the options.

A JavaScript file (`.js`, `.mjs` or `.cjs`) runs in the same way, also
when a `tsconfig.json` does not allow JavaScript. `tsc` checks its syntax,
and its types only when the file starts with the comment `// @ts-check`,
as in Deno. A TypeScript file may import a JavaScript file.

`ts` ends with the exit code of the program, or with the exit code of `tsc`
after an error of the check. When Ctrl+C, `kill` or a closed terminal ends
the program, `ts` ends by the same signal, so a loop or a script of the
shell stops after Ctrl+C, as with `node`. An error of the program names the
line of the `.ts` file, because Node.js runs with the source maps of `tsc`.

## The functions prompt, alert and confirm

`ts` adds three global functions, as Deno and the browser have them:

| Function | Effect |
| --- | --- |
| `prompt(message, defaultValue)` | Shows the message, waits for a line of the keyboard and returns it. An empty line returns `defaultValue` when there is one; the end of the input (Ctrl+D) returns `null`. |
| `alert(message)` | Shows the message and waits until you press Enter. |
| `confirm(message)` | Shows the message with `[y/N]` and returns `true` for the answer `y` or `Y`. |

They read from the keyboard and wait, so the program stops until you press
Enter. Input from a file or a pipe works too, for example
`ts main.ts < input.txt`.

`ts` knows their types in every project of `ts`, as Deno knows its own
globals: the types are part of `ts`, and a project needs no file for them.
In a project of `ts init`, `ts` adds them to the settings of its
`tsconfig.json`, unless the project has the types of the browser (`"lib"`
with `"dom"`), which declare the three functions themselves. The VS Code extension
[nimblescape TypeScript](https://marketplace.visualstudio.com/items?itemName=nimblescape.nimblescape-typescript)
does the same in the editor. Plain `tsc` does not know them; a project that
also has to pass plain `tsc` declares them in a file of its own, for example
`globals.d.ts`:

```ts
declare function prompt(message?: string, defaultValue?: string): string | null;
declare function alert(message?: string): void;
declare function confirm(message?: string): boolean;
```

## Settings without tsconfig.json

A `tsconfig.json` of the folder of the file or of a folder above it always
wins. Without one, `ts` uses the built-in defaults of `tsc` (for example
`strict`), with what a program for Node.js needs:

| Setting | Value | Why |
| --- | --- | --- |
| `module` | `nodenext` | The module system of Node.js. |
| `lib` | `["esnext"]` | JavaScript without the browser: `document` and `window` are errors. |
| `types` | `["node"]` and the types of `prompt()`, `alert()` and `confirm()` | `process`, `node:fs` and the other modules of Node.js. `ts` contains the types of Node.js. |
| `skipLibCheck` | `true` | Checks your files, not the type files of the packages, as `tsc --init` sets it. |
| `allowJs` | `true` | `ts` runs a JavaScript file, and a TypeScript file may import one. `checkJs` stays off, as in `tsc` and Deno. |
| `rewriteRelativeImportExtensions` | `true` | An import names the `.ts` file, as Node.js needs it: `import { Dog } from "./dog.ts"`. |

Without a `package.json`, every file is an ES module, as if the folder had a
`package.json` with `"type": "module"`, as in Deno. This also holds for a
project of `ts init`, in `ts` and in the editor; plain `tsc` reads such a
file as CommonJS for `module` `nodenext`. With a `package.json`, its `type`
decides, as in Node.js.

## Projects with a tsconfig.json

A `tsconfig.json` belongs to `ts` only when its `compilerOptions.plugins`
names the editor plugin, as `ts init` writes it:

```json
"plugins": [{ "name": "nimblescape-typescript-plugin" }]
```

Only such a project gets the types of `prompt()`, `alert()` and `confirm()`,
and every file of it is an ES module without a `package.json`. `tsc` and
Vite ignore the entry. Any other `tsconfig.json`, for example the one of a
Vite project, is a standard project: `ts` checks it as `tsc` does, and the
editor plugin leaves it to TypeScript. Delete the line, and the project of
`ts init` becomes a standard project.

## Which TypeScript

`ts` contains no TypeScript. It uses the first of these:

1. The TypeScript of the project, when the nearest `package.json` lists
   `typescript`.
2. In a terminal of VS Code with the extension
   [nimblescape TypeScript](https://marketplace.visualstudio.com/items?itemName=nimblescape.nimblescape-typescript):
   the TypeScript of VS Code, so the editor and `ts` report the same errors.
3. The global TypeScript (`npm install --global typescript`).

When `ts` finds none, it shows a list in the terminal: the versions of
npm from TypeScript 6 on, without the nightly builds, newest first. The
arrow keys select a version, which is cyan, Enter installs it globally
with npm, and Esc cancels. The recommended version is selected first: the TypeScript of the
newest stable VS Code, which `ts` reads from `update.code.visualstudio.com`
and GitHub; offline, it is the TypeScript of VS Code when this version of
`ts` was built. Without a terminal, for example in a script, `ts` prints
the command with that built-in version, without a request to the network,
and ends with 1.

When the global TypeScript is too old for `ts` (below TypeScript 6), `ts`
asks in the terminal whether to upgrade it and then shows the same list.
npm keeps one global version of a package, so the new version replaces the
old one. With a `prefix` in `~/.npmrc`, npm installs into another folder
than the one next to Node.js; when both folders hold a TypeScript, `ts`
takes the one of TypeScript 6 or newer. When `ts` still finds the old
version after the upgrade, it names its folder and ends with 1, without a
second question. Without a terminal, `ts` only names the version it found
and ends with 1.

`ts install --global` shows the same list at any time, also when a
TypeScript is installed, for example to change to another version, and
`ts install` does so outside a project. Without a terminal, both install
the recommended version without a question.

## Packages

`ts` runs a file of a project with the packages of its `node_modules`. When
the nearest `package.json` lists packages that are not installed, `ts` asks
whether to install them: with `npm ci` when the folder has a
`package-lock.json`, otherwise with `npm install`. Without a terminal, it
prints the command and ends with 1.

`ts install` runs the same command at any time, without a question, also
when nothing is missing, for example after a change of `package-lock.json`.
In a folder whose `package.json` lists no packages, or without a
`package.json`, `ts` uses the global TypeScript, so `ts install` installs
TypeScript globally there. To change the global TypeScript inside a project,
use `ts install --global`.

`ts` writes the compiled files into `node_modules/.cache/ts/` of the project,
or into the temporary folder of the system when the file has no
`package.json`, and deletes them after the run. It changes no other file,
except what `tsc --build` writes for `ts check` of a project with
`references`.

## Tab completion

The completion script completes the commands, the options and the
TypeScript files of the folder, and after a command its argument: a
TypeScript file after `ts check`, `--global` after `ts install`, a shell
after `ts completion`. Add one line to the start file of your shell: for bash to
`~/.bashrc`, for zsh to `~/.zshrc` after `compinit`, for fish to
`~/.config/fish/config.fish`.

```sh
source <(ts completion bash)   # bash
source <(ts completion zsh)    # zsh
ts completion fish | source    # fish
```

In the terminals of VS Code, the extension nimblescape TypeScript sets up
the completion without this line: for bash with the package
bash-completion, and for zsh when `~/.zshrc` runs `compinit`.

## Limits

- TypeScript 7 cannot read the `package.json` that `ts` assumes: without a
  `package.json`, `ts` checks a file there with `module` `preserve` and
  `moduleResolution` `bundler`. The program runs the same.
- `ts` runs no JSX and builds no libraries.
- Plain `tsc` does not know `prompt()`, `alert()` and `confirm()`; see
  [the functions prompt, alert and confirm](#the-functions-prompt-alert-and-confirm).
  It also does not make every file an ES module without a `package.json`.
- TypeScript 7 cannot read the `package.json` that `ts` assumes in a
  project with a `tsconfig.json` either: there, the project needs a real
  `package.json` with `"type": "module"`, which `ts init` writes with
  TypeScript 7.

---

[Source and documentation](https://github.com/nimblescape/nimblescape-typescript) ·
[Change log](https://github.com/nimblescape/nimblescape-typescript/blob/main/CHANGELOG.md) ·
[Issues](https://github.com/nimblescape/nimblescape-typescript/issues) ·
[Support](https://github.com/nimblescape/nimblescape-typescript/blob/main/SUPPORT.md)

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-typescript/blob/main/LICENSE).
