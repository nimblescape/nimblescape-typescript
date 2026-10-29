// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command words and the options of the command ts, in one place: the help (`ts --help`) and the Tab completion
// scripts (`ts completion <shell>`, completion.ts) are written from them, so both always name the same commands. A
// command word stands first, as with npm and git (`ts install`); every other first word is the file to run.

export interface Option {
  /** The option as the user types it, for example `--global`. */
  readonly name: string;
  /** A short form of the option, for example `-h`. */
  readonly short?: string;
  /** One line for the help and for the Tab completion. No brackets, colons or quotes: zsh reads them as syntax. */
  readonly description: string;
}

/** A command word of ts, for example `check`. */
export interface Verb {
  /** The word as the user types it. */
  readonly name: string;
  /** Short forms of the word, for example `i` for `install`, as with npm. */
  readonly aliases?: readonly string[];
  /** The argument of the command, as the help shows it, for example `[file]` or `<shell>`. */
  readonly argument?: string;
  /** The values of the argument, which the Tab completion offers. */
  readonly values?: readonly string[];
  /** The options that only this command knows. */
  readonly options?: readonly Option[];
  /** One line for the help and for the Tab completion. No brackets, colons or quotes: zsh reads them as syntax. */
  readonly description: string;
}

/** The shells of `ts completion <shell>`. */
export const SHELLS = ['bash', 'zsh', 'fish'] as const;
export type Shell = (typeof SHELLS)[number];

export const COMMANDS: readonly Verb[] = [
  { name: 'check', argument: '[file]', description: 'check the file and run nothing, or the project of the tsconfig.json of this folder' },
  { name: 'init', description: 'write a tsconfig.json with the settings of tsc --init for Node.js into this folder' },
  {
    name: 'install',
    aliases: ['i'],
    options: [{ name: '--global', short: '-g', description: 'install TypeScript globally, in a terminal from a list of versions' }],
    description: 'install the packages of this project, or TypeScript globally',
  },
  { name: 'completion', argument: '<shell>', values: SHELLS, description: 'print the Tab completion script for bash, zsh or fish' },
];

export const OPTIONS: readonly Option[] = [
  { name: '--version', short: '-v', description: 'print the versions of ts, TypeScript and Node.js' },
  { name: '--help', short: '-h', description: 'print this help' },
];

/** The help of `ts --help`. `version` is the version of ts. */
export function helpText(version: string): string {
  const usage = [
    ['ts [file] [arguments]', 'check, compile and run the file with Node.js (default main.ts)'],
    ...COMMANDS.flatMap((command) => {
      const short = command.aliases?.[0];
      return [
        [`ts ${command.name}${command.argument ? ` ${command.argument}` : ''}${short ? `, ts ${short}` : ''}`, command.description],
        ...(command.options ?? []).map((option) => [`ts ${command.name} ${option.name}${option.short ? `, ts ${short ?? command.name} ${option.short}` : ''}`, option.description]),
      ];
    }),
    ...OPTIONS.map((option) => [`ts ${option.name}, ts ${option.short}`, option.description]),
  ];
  const column = (rows: string[][]) => {
    const width = Math.max(...rows.map(([left]) => left.length));
    return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`).join('\n');
  };
  return [
    `ts ${version}: checks a TypeScript or JavaScript file with tsc, compiles it and runs it with Node.js.`,
    '',
    'Usage:',
    column(usage),
    '',
    'The arguments after the file go to the program. A file with the name of a command runs with ts ./<name>.',
    'Without a tsconfig.json, ts uses the built-in defaults of tsc with the types of Node.js, and every file is an',
    'ES module. A tsconfig.json of the folder or of a folder above always wins.',
    'https://github.com/nimblescape/typescript-vscode',
  ].join('\n');
}
