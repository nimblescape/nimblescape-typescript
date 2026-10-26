// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command line of ts: a command word first (check, init, install or i, completion), or the file to run; the options
// before the file; and the arguments of the program after it. `--` ends the options, so a file whose name starts with
// a dash can run too, and `ts ./check` runs a file with the name of a command.

import { COMMANDS, OPTIONS, SHELLS, type Shell } from './options.ts';

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
  const verb = argv.length > 0 ? VERBS.get(argv[0]) : undefined;
  let i = verb === undefined ? 0 : 1;
  if (verb === 'check') command.check = true;
  else if (verb === 'init') command.init = true;
  else if (verb === 'install') command.install = true;
  else if (verb === 'completion') {
    // ts completion takes the next word, its shell.
    command.completion = argv[i++];
    if (!SHELLS.includes(command.completion as Shell)) return `ts completion needs one of: ${SHELLS.join(', ')}.`;
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
    if ((word === '--global' || word === '-g') && verb === 'install') command.global = true;
    else if (word === '--global' || word === '-g') return `${word} works only with ts install. See ts --help.`;
    else if (!KNOWN.has(word)) return `Unknown option ${word}. See ts --help.`;
    else if (word === '--version' || word === '-v') command.version = true;
    else if (word === '--help' || word === '-h') command.help = true;
  }
  if (command.file !== undefined && verb !== undefined && verb !== 'check') return `ts ${verb} takes no file. See ts --help.`;
  return command;
}
