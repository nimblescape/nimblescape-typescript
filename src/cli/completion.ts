// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The Tab completion scripts of `ts --completion bash|zsh|fish`, written from the option list (options.ts). They
// complete the options, the shells of --completion and the TypeScript files of the folder; after the file, the words
// are arguments of the program, so they complete any file name.
//
// - bash: `source <(ts --completion bash)` in ~/.bashrc, or the file in a folder bash-completion/completions/ts of
//   XDG_DATA_DIRS, which bash-completion loads when ts is first completed (the extension uses this).
// - zsh: `source <(ts --completion zsh)` in ~/.zshrc after compinit, or the file _ts in a folder of fpath (the
//   extension adds its folder to FPATH). The same text works both ways.
// - fish: `ts --completion fish | source` in ~/.config/fish/config.fish, or the file
//   ~/.config/fish/completions/ts.fish.

import { OPTIONS, type Shell } from './options.ts';

/** The names of the options, the short forms included. */
const names = (): string[] => OPTIONS.flatMap((option) => (option.short ? [option.name, option.short] : [option.name]));

function bash(): string {
  const valued = OPTIONS.filter((option) => option.values);
  const cases = valued.map((option) => `    ${option.name}) COMPREPLY=($(compgen -W "${option.values!.join(' ')}" -- "$cur")); return ;;`);
  return `# Tab completion of the command ts for bash: ts --completion bash
_ts_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" i
  case "$prev" in
${cases.join('\n')}
  esac
  # After the file, the words are arguments of the program.
  for ((i = 1; i < COMP_CWORD; i++)); do
    case "\${COMP_WORDS[i]}" in
      -*) ;;
      *) [[ "\${COMP_WORDS[i-1]}" == --completion ]] || { compopt -o default; COMPREPLY=(); return; } ;;
    esac
  done
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${names().join(' ')}" -- "$cur"))
    return
  fi
  compopt -o filenames
  COMPREPLY=($(compgen -d -- "$cur") $(compgen -f -X '!*.ts' -- "$cur") $(compgen -f -X '!*.mts' -- "$cur") $(compgen -f -X '!*.cts' -- "$cur"))
}
complete -F _ts_completion ts
`;
}

function zsh(): string {
  const specs = OPTIONS.map((option) => {
    const description = `[${option.description}]`;
    const value = option.values ? `:${option.argument?.replace(/[<>]/g, '') ?? 'value'}:(${option.values.join(' ')})` : '';
    const exclusive = option.short ? `'(- *)'{${option.short},${option.name}}` : `'${option.name}`;
    return option.short ? `    ${exclusive}'${description}'` : `    ${exclusive}${description}${value}'`;
  });
  return `#compdef ts
# Tab completion of the command ts for zsh: ts --completion zsh
_ts() {
  _arguments -s -S \\
${specs.join(' \\\n')} \\
    '1:TypeScript file:_files -g "*.(ts|mts|cts)(-.)"' \\
    '*::argument of the program:_files'
}
if [[ "\${funcstack[1]}" == _ts ]]; then
  _ts "$@"
else
  compdef _ts ts
fi
`;
}

function fish(): string {
  const lines = OPTIONS.map((option) => {
    const short = option.short ? ` -s ${option.short.slice(1)}` : '';
    const values = option.values ? ` -x -a '${option.values.join(' ')}'` : '';
    return `complete -c ts -l ${option.name.slice(2)}${short}${values} -d '${option.description}'`;
  });
  return `# Tab completion of the command ts for fish: ts --completion fish
${lines.join('\n')}
complete -c ts -k -a '(__fish_complete_suffix .ts)'
`;
}

export function completionScript(shell: Shell): string {
  return { bash, zsh, fish }[shell]();
}
