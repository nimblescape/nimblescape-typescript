// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The command line of ts: the options before the file, the file, and the arguments of the program after it. `--` ends
// the options, so a file whose name starts with a dash can run too.

import { OPTIONS, SHELLS, type Shell } from './options.ts';

export interface Command {
  check: boolean;
  init: boolean;
  browser: boolean;
  installTypeScript: boolean;
  completion?: string;
  version: boolean;
  help: boolean;
  file?: string;
  args: string[];
}

/** Reads the options before the file, the file, and the arguments of the program. */
export function parseArguments(argv: readonly string[]): Command | string {
  const command: Command = { check: false, init: false, browser: false, installTypeScript: false, version: false, help: false, args: [] };
  const known = new Set(OPTIONS.flatMap((option) => [option.name, option.short].filter((name) => name !== undefined)));
  for (let i = 0; i < argv.length; i++) {
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
    if (!known.has(word)) return `Unknown option ${word}. See ts --help.`;
    if (word === '--check') command.check = true;
    else if (word === '--init') command.init = true;
    else if (word === '--browser') command.browser = true;
    else if (word === '--install-typescript') command.installTypeScript = true;
    else if (word === '--version' || word === '-v') command.version = true;
    else if (word === '--help' || word === '-h') command.help = true;
    else if (word === '--completion') {
      command.completion = argv[++i];
      if (!SHELLS.includes(command.completion as Shell)) return `--completion needs one of: ${SHELLS.join(', ')}.`;
    }
  }
  if (command.browser && !command.init) return '--browser works only with --init.';
  return command;
}
