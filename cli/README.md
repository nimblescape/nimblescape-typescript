# @nimblescape/typescript

The command `ts` runs a TypeScript file with Node.js. It checks the file
with `tsc`, the TypeScript compiler, compiles it and runs the JavaScript with
Node.js, in one step: `ts main.ts`. A program can use `prompt()`, `alert()`
and `confirm()` as in the browser, without an import. A folder needs no
`tsconfig.json` and no `package.json`.

![A terminal in four scenes: npm installs @nimblescape/typescript globally, ts runs main.ts and its arguments, ts stops at a type error, ts --check checks a file, ts --init writes a tsconfig.json, ts --install-typescript installs TypeScript, ts --completion zsh turns on the Tab completion, and ts --version and ts --help print their text; a blue band above the terminal names each scene](https://raw.githubusercontent.com/nimblescape/nimblescape-typescript/main/docs/images/ts.gif)

`ts` is a small wrapper around `tsc` and `node`. Every error comes from
`tsc` or from Node.js, and the only addition to Node.js is the three
functions `prompt()`, `alert()` and `confirm()`.

## Install

```sh
npm install --global @nimblescape/typescript
```

`ts` needs Node.js 22 or newer and TypeScript 6 or newer. When `ts` finds no
TypeScript, it offers to install one globally with npm (see
[Which TypeScript](#which-typescript)). `ts --install-typescript` installs
it without a question.

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
ts --check main.ts   # checks main.ts and runs nothing
```

| Command | Effect |
| --- | --- |
| `ts [file] [arguments]` | Checks the file with `tsc`, compiles it and runs it with Node.js. Without a file, `ts` runs `main.ts` of the current folder. The words after the file are the arguments of the program (`process.argv`). When `tsc` finds an error, `ts` prints it and runs nothing. |
| `ts --check [file]` | Checks the file and runs nothing. Without a file, `ts` checks `main.ts` of the current folder, and without `main.ts` the project of the `tsconfig.json` of the current folder. |
| `ts --init` | Writes a `tsconfig.json` into the current folder: the file of `tsc --init`, with the settings for Node.js (`lib` `esnext` and the types of Node.js) and without `noUncheckedIndexedAccess`. It does not replace an existing `tsconfig.json`. |
| `ts --init --browser` | Writes a `tsconfig.json` for code that runs in the browser: `lib` `esnext` and `dom`, and no types of Node.js. |
| `ts --install-typescript` | Installs the TypeScript of the newest VS Code globally with `npm install --global typescript@<version>`, without a question. |
| `ts --completion <shell>` | Prints the Tab completion script for `bash`, `zsh` or `fish` (see [Tab completion](#tab-completion)). |
| `ts --version`, `ts -v` | Prints the versions of `ts`, of the TypeScript that `ts` uses and of Node.js. |
| `ts --help`, `ts -h` | Prints the help. |

The options stand before the file; every word after the file goes to the
program, also a word that starts with `-`. `--` ends the options.

`ts` ends with the exit code of the program, or with the exit code of `tsc`
after an error of the check. An error of the program names the line of the
`.ts` file, because Node.js runs with the source maps of `tsc`.

## The functions prompt, alert and confirm

`ts` adds three global functions, as Deno and the browser have them:

| Function | Effect |
| --- | --- |
| `prompt(message, defaultValue)` | Shows the message, waits for a line of the keyboard and returns it. An empty line returns `defaultValue` when there is one; the end of the input (Ctrl+D) returns `null`. |
| `alert(message)` | Shows the message and waits until you press Enter. |
| `confirm(message)` | Shows the message with `[y/N]` and returns `true` for the answer `y` or `Y`. |

They read from the keyboard and wait, so the program stops until you press
Enter. Input from a file or a pipe works too, for example
`ts main.ts < input.txt`. Without a `tsconfig.json`, `tsc` knows their types.
A project with its own `tsconfig.json` declares them itself, for example in
a file `globals.d.ts`:

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
| `rewriteRelativeImportExtensions` | `true` | An import names the `.ts` file, as Node.js needs it: `import { Dog } from "./dog.ts"`. |

Without a `package.json`, every file is an ES module, as if the folder had a
`package.json` with `"type": "module"`. With a `package.json`, its `type`
decides, as in Node.js.

## Which TypeScript

`ts` contains no TypeScript. It uses the first of these:

1. The TypeScript of the project, when the nearest `package.json` lists
   `typescript`.
2. In a terminal of VS Code with the extension
   [nimblescape TypeScript](https://marketplace.visualstudio.com/items?itemName=nimblescape.nimblescape-typescript):
   the TypeScript of VS Code, so the editor and `ts` report the same errors.
3. The global TypeScript (`npm install --global typescript`).

When `ts` finds none, it asks in the terminal which version npm shall
install globally. The default is the TypeScript of the newest stable
VS Code, which `ts` reads from `update.code.visualstudio.com` and GitHub;
offline, it is the TypeScript of VS Code when this version of `ts` was
built. Without a terminal, for example in a script, `ts` prints the command
and ends with 1.

## Packages

`ts` runs a file of a project with the packages of its `node_modules`. When
the nearest `package.json` lists packages that are not installed, `ts` asks
whether to install them: with `npm ci` when the folder has a
`package-lock.json`, otherwise with `npm install`. Without a terminal, it
prints the command and ends with 1.

`ts` writes the compiled files into `node_modules/.cache/ts/` of the project,
or into the temporary folder of the system when the file has no
`package.json`, and deletes them after the run. It changes no other file.

## Tab completion

The completion script completes the options and the TypeScript files of the
folder. Add one line to the start file of your shell: for bash to
`~/.bashrc`, for zsh to `~/.zshrc` after `compinit`, for fish to
`~/.config/fish/config.fish`.

```sh
source <(ts --completion bash)   # bash
source <(ts --completion zsh)    # zsh
ts --completion fish | source    # fish
```

In the terminals of VS Code, the extension nimblescape TypeScript sets up
the completion without this line: for bash with the package
bash-completion, and for zsh when `~/.zshrc` runs `compinit`.

## Limits

- TypeScript 7 cannot read the `package.json` that `ts` assumes: without a
  `package.json`, `ts` checks a file there with `module` `preserve` and
  `moduleResolution` `bundler`. The program runs the same.
- With a `tsconfig.json`, TypeScript 7 does not add the declaration files of
  the project (`.d.ts`) to the check of one file; TypeScript 6 does.
- After `ts --init`, install the types of Node.js in the project:
  `npm install --save-dev @types/node`.
- `ts` runs no JSX and builds no libraries.

---

[Source and documentation](https://github.com/nimblescape/nimblescape-typescript) ·
[Change log](https://github.com/nimblescape/nimblescape-typescript/blob/main/CHANGELOG.md) ·
[Issues](https://github.com/nimblescape/nimblescape-typescript/issues) ·
[Support](https://github.com/nimblescape/nimblescape-typescript/blob/main/SUPPORT.md)

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-typescript/blob/main/LICENSE).
