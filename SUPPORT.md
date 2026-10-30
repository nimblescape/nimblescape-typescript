# Support

nimblescape TypeScript is free and open source. Ask questions and report
problems in the
[issues on GitHub](https://github.com/nimblescape/typescript-vscode/issues).
Search the open and closed issues first. The README describes
[the limits of the filter](https://github.com/nimblescape/typescript-vscode/blob/main/README.md#limits).

## What to include in a report

- The version of the extension (the Extensions view shows it) and of VS Code
  (command **Help: About**).
- Your operating system and its version, for example Windows 11, macOS 15 or
  Ubuntu 24.04.
- Where the folder of the workspace is: on your computer, or on a remote host
  (for example over SSH, in WSL or in a dev container).
- The TypeScript that the editor uses: the version in the status bar of a
  TypeScript file, or the command **TypeScript: Select TypeScript Version**.
- The `package.json` and `tsconfig.json` files of the project, the line that
  you typed, and the entries of the list of completions that you expected and
  that you got. A screenshot of the list helps.
- What you did, what you expected, and what happened, with the exact text of
  each message.

The log of the TypeScript server shows whether it loaded the plugin: set
`typescript.tsserver.log` to `normal`, run the command **TypeScript: Open TS
Server log**, and search for `nimblescape-typescript-plugin`.

## Before you post

An issue is public. A `package.json` file, a log or a screenshot can contain
the names of your projects and folders, and the user name of your computer.
Remove what you do not want to show. Never post a token or a password. Do not
report a security problem in a public issue: the section
[Security problems](https://github.com/nimblescape/typescript-vscode/blob/main/docs/security.md#security-problems)
says how to report it.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/typescript-vscode/blob/main/LICENSE).
