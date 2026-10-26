// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The options of the command ts, in one list: the help (`ts --help`) and the Tab completion scripts
// (`ts --completion <shell>`, completion.ts) are written from it, so both always name the same options.

export interface Option {
  /** The option as the user types it, for example `--check`. */
  readonly name: string;
  /** A short form of the option, for example `-h`. */
  readonly short?: string;
  /** The argument of the option, as the help shows it, for example `<shell>`. */
  readonly argument?: string;
  /** The values of the argument, which the Tab completion offers. */
  readonly values?: readonly string[];
  /** One line for the help and for the Tab completion. No brackets and no colons: zsh reads them as syntax. */
  readonly description: string;
}

/** The shells of `ts --completion <shell>`. */
export const SHELLS = ['bash', 'zsh', 'fish'] as const;
export type Shell = (typeof SHELLS)[number];

export const OPTIONS: readonly Option[] = [
  { name: '--check', description: 'check the types only and run nothing' },
  { name: '--init', description: 'write a tsconfig.json with the settings of tsc --init for Node.js' },
  { name: '--install-typescript', description: 'install TypeScript globally, in a terminal from a list of versions' },
  { name: '--completion', argument: '<shell>', values: SHELLS, description: 'print the Tab completion script for bash, zsh or fish' },
  { name: '--version', short: '-v', description: 'print the versions of ts, TypeScript and Node.js' },
  { name: '--help', short: '-h', description: 'print this help' },
];

/** The help of `ts --help`. `version` is the version of ts. */
export function helpText(version: string): string {
  const usage = [
    ['ts [file] [arguments]', 'check, compile and run the file with Node.js (default main.ts)'],
    ['ts --check [file]', 'check the file, or the project of the tsconfig.json of this folder'],
    ['ts --init', 'write a tsconfig.json into this folder'],
    ['ts --install-typescript', 'install TypeScript globally with npm'],
    ['ts --completion <shell>', 'print the Tab completion script'],
  ];
  const options = OPTIONS.map((option) => [
    [option.short, `${option.name}${option.argument ? ` ${option.argument}` : ''}`].filter(Boolean).join(', '),
    option.description,
  ]);
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
    'Options:',
    column(options),
    '',
    'The arguments after the file go to the program. Without a tsconfig.json, ts uses the built-in defaults of tsc',
    'with the types of Node.js, and every file is an ES module. A tsconfig.json of the folder or of a folder above',
    'always wins. https://github.com/nimblescape/nimblescape-typescript',
  ].join('\n');
}
