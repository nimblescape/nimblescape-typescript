# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.1.0

The first version.

**Auto-imports that a program needs.** A plugin of the TypeScript server
hides the auto-import completions of names that the program can use without
an import: an export whose name is a global name of the file, such as
`parseInt` of `es-toolkit/compat` next to the global `parseInt`, and an
export of a module whose only export is a global object, such as `log` of
`node:console` (`console`) and `exit` of `node:process` (`process`). The
plugin reads the program and uses no list of names. The exports of the files
of the project, of the packages and of the modules of Node.js stay, also
`on` and `once` of `node:events`. The plugin works with the TypeScript of
VS Code and with the TypeScript of the workspace (setting `typescript.tsdk`).

**Install hint.** When the `package.json` file of a folder of the workspace
lists `typescript` and `node_modules/typescript/lib/tsserver.js` is missing,
a hint offers **Run npm ci**, which runs `npm ci` (or `npm install` without
`package-lock.json`) in a terminal in the folder. When TypeScript is
installed, a second hint offers **Reload window**. The hint appears only in a
trusted workspace.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-typescript/blob/main/LICENSE).
