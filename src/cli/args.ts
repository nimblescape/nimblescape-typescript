// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command line of ts: a command word first (check, init, install or i, completion), or the file to run; the options
// before the file; and the arguments of the program after it. `--` ends the options, so a file whose name starts with
// a dash can run too, and `ts ./check` runs a file with the name of a command. The options of ts 0.2.0 to 0.2.2
// (`--check`, `--init`, `--completion`, `--install-typescript`) still mean their commands.

import { COMMANDS, OLD_OPTIONS, OPTIONS, SHELLS, type Shell } from './options.ts';

export interface Command {
  check: boolean;
  init: boolean;
  install: boolean;
  global: boolean;
  completion?: string;
  version: boolean;
  help: boolean;
  file?: string;
  args: string[];
}

/** The command words and their short forms, each with the command that it means. */
const VERBS = new Map(COMMANDS.flatMap((verb) => [verb.name, ...(verb.aliases ?? [])].map((word) => [word, verb.name])));
const KNOWN = new Set(OPTIONS.flatMap((option) => [option.name, option.short].filter((name) => name !== undefined)));

/** Reads the command word or the options before the file, the file, and the arguments of the program. */
export function parseArguments(argv: readonly string[]): Command | string {
  const command: Command = { check: false, init: false, install: false, global: false, version: false, help: false, args: [] };
  let verb: string | undefined;
  let i = 0;
  /** Takes the command `name`; `ts completion` also takes the next word, its shell. An error text, or undefined. */
  const take = (name: string): string | undefined => {
    if (verb !== undefined) return `ts ${verb} and ts ${name} cannot run together. See ts --help.`;
    verb = name;
    if (name === 'check') command.check = true;
    else if (name === 'init') command.init = true;
    else if (name === 'install') command.install = true;
    else if (name === 'completion') {
      command.completion = argv[++i];
      if (!SHELLS.includes(command.completion as Shell)) return `ts completion needs one of: ${SHELLS.join(', ')}.`;
    }
    return undefined;
  };
  const first = argv.length > 0 ? VERBS.get(argv[0]) : undefined;
  if (first !== undefined) {
    const error = take(first);
    if (error) return error;
    i++;
  }
  for (; i < argv.length; i++) {
    const word = argv[i];
    if (word === '--') {
      command.file = argv[i + 1];
      command.args = argv.slice(i + 2);
      break;
    }
    if (!word.startsWith('-') || word === '-') {
      command.file = word;
      command.args = argv.slice(i + 1);
      break;
    }
    const old = OLD_OPTIONS[word];
    if (old) {
      const error = take(old.command);
      if (error) return error;
      if (old.global) command.global = true;
    } else if ((word === '--global' || word === '-g') && verb === 'install') command.global = true;
    else if (word === '--global' || word === '-g') return `${word} works only with ts install. See ts --help.`;
    else if (!KNOWN.has(word)) return `Unknown option ${word}. See ts --help.`;
    else if (word === '--version' || word === '-v') command.version = true;
    else if (word === '--help' || word === '-h') command.help = true;
  }
  if (command.file !== undefined && verb !== undefined && verb !== 'check') return `ts ${verb} takes no file. See ts --help.`;
  return command;
}
