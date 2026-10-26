// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The Tab completion scripts of `ts completion bash|zsh|fish`, written from the commands and options (options.ts). In
// the first place they complete the command words, the options and the TypeScript files of the folder; after
// `ts check`, a TypeScript file; after `ts install` or `ts i`, --global and -g; after `ts completion`, the shells;
// after the file, the words are arguments of the program, so they complete any file name. The first place does not
// offer the short form `i`.
//
// - bash: `source <(ts completion bash)` in ~/.bashrc, or the file in a folder bash-completion/completions/ts of
//   XDG_DATA_DIRS, which bash-completion loads when ts is first completed (the extension uses this).
// - zsh: `source <(ts completion zsh)` in ~/.zshrc after compinit, or the file _ts in a folder of fpath (the
//   extension adds its folder to FPATH). The same text works both ways.
// - fish: `ts completion fish | source` in ~/.config/fish/config.fish, or the file
//   ~/.config/fish/completions/ts.fish.

import { COMMANDS, OPTIONS, type Option, type Shell, type Verb } from './options.ts';

/** The names of the options, the short forms included. */
const names = (options: readonly Option[]): string[] => options.flatMap((option) => (option.short ? [option.name, option.short] : [option.name]));

/** The command words. */
const verbs = (): string[] => COMMANDS.map((command) => command.name);

/** The patterns of a command for a case of bash and zsh: the word and its short forms, for example `install|i`. */
const pattern = (command: Verb): string => [command.name, ...(command.aliases ?? [])].join('|');

function bash(): string {
  const files = `$(compgen -d -- "$cur") $(compgen -f -X '!*.ts' -- "$cur") $(compgen -f -X '!*.mts' -- "$cur") $(compgen -f -X '!*.cts' -- "$cur")`;
  const cases = COMMANDS.map((command) => {
    if (command.name === 'check') return `    check) ((COMP_CWORD == 2)) && { compopt -o filenames; COMPREPLY=(${files}); } ;;`;
    const words = command.values ?? names(command.options ?? []);
    if (words.length === 0) return `    ${pattern(command)}) ;;`;
    return `    ${pattern(command)}) ((COMP_CWORD == 2)) && COMPREPLY=($(compgen -W "${words.join(' ')}" -- "$cur")) ;;`;
  });
  return `# Tab completion of the command ts for bash: ts completion bash
_ts_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  # The first word: a command, an option or a TypeScript file.
  if ((COMP_CWORD == 1)); then
    if [[ "$cur" == -* ]]; then
      COMPREPLY=($(compgen -W "${names(OPTIONS).join(' ')}" -- "$cur"))
      return
    fi
    compopt -o filenames
    COMPREPLY=($(compgen -W "${verbs().join(' ')}" -- "$cur") ${files})
    return
  fi
  case "\${COMP_WORDS[1]}" in
${cases.join('\n')}
    # After the file, the words are arguments of the program.
    *) compopt -o default; COMPREPLY=() ;;
  esac
}
complete -F _ts_completion ts
`;
}

function zsh(): string {
  const entries = (pairs: [string, string][]) => pairs.map(([name, description]) => `    '${name}:${description}'`).join('\n');
  const options = OPTIONS.flatMap((option) => names([option]).map((name): [string, string] => [name, option.description]));
  const cases = COMMANDS.map((command) => {
    if (command.name === 'check') return `    check) (( CURRENT == 3 )) && _files -g '*.(ts|mts|cts)(-.)' ;;`;
    if (command.values) return `    ${pattern(command)}) (( CURRENT == 3 )) && _values '${command.argument?.replace(/[<>]/g, '')}' ${command.values.join(' ')} ;;`;
    if (command.options) {
      const list = command.options.flatMap((option) => names([option]).map((name) => `'${name}:${option.description}'`)).join(' ');
      return `    ${pattern(command)}) (( CURRENT == 3 )) && { local -a flags=(${list}); _describe -O 'option' flags; } ;;`;
    }
    return `    ${pattern(command)}) ;;`;
  });
  return `#compdef ts
# Tab completion of the command ts for zsh: ts completion zsh
_ts() {
  local -a commands options
  commands=(
${entries(COMMANDS.map((command) => [command.name, command.description]))}
  )
  options=(
${entries(options)}
  )
  # The first word: a command, an option or a TypeScript file.
  if (( CURRENT == 2 )); then
    if [[ $PREFIX == -* ]]; then
      _describe -t options 'option' options
    else
      _describe -t commands 'command' commands
      _files -g '*.(ts|mts|cts)(-.)'
    fi
    return
  fi
  case $words[2] in
${cases.join('\n')}
    # After the file, the words are arguments of the program.
    *) _files ;;
  esac
}
if [[ "\${funcstack[1]}" == _ts ]]; then
  _ts "$@"
else
  compdef _ts ts
fi
`;
}

function fish(): string {
  const first = '__fish_use_subcommand';
  const lines = [
    ...COMMANDS.map((command) => `complete -c ts -n ${first} -a ${command.name} -d '${command.description}'`),
    ...OPTIONS.map((option) => `complete -c ts -n ${first}${option.short ? ` -s ${option.short.slice(1)}` : ''} -l ${option.name.slice(2)} -d '${option.description}'`),
    ...COMMANDS.flatMap((command) => {
      const seen = `'__fish_seen_subcommand_from ${[command.name, ...(command.aliases ?? [])].join(' ')}'`;
      return [
        ...(command.options ?? []).map((option) => `complete -c ts -n ${seen}${option.short ? ` -s ${option.short.slice(1)}` : ''} -l ${option.name.slice(2)} -d '${option.description}'`),
        ...(command.values ? [`complete -c ts -n ${seen} -x -a '${command.values.join(' ')}'`] : []),
      ];
    }),
  ];
  return `# Tab completion of the command ts for fish: ts completion fish
${lines.join('\n')}
complete -c ts -n '${first}; or __fish_seen_subcommand_from check' -k -a '(__fish_complete_suffix .ts)'
`;
}

export function completionScript(shell: Shell): string {
  return { bash, zsh, fish }[shell]();
}
