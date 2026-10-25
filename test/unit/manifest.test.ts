// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Checks the manifest, the plugin package, the files of the package, the documents and the license headers of the
// repository: the TypeScript server finds the plugin under the name of the manifest in the folder of the package, the
// package keeps the files that VS Code and the TypeScript server load, the bundles leave out only the editor API and the
// built-in modules of Node.js, the documents of the Marketplace link to web addresses only, and every source file
// starts with the license header.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The root folder of this repository, which holds the manifest and the documents. */
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string): string => fs.readFileSync(path.join(repository, file), 'utf8');
const manifest = JSON.parse(read('package.json'));
const plugin = JSON.parse(read('plugin/package.json'));

/** The files that the package holds, besides extension.vsixmanifest and [Content_Types].xml. */
const PACKAGE_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'SUPPORT.md',
  'cli/dist/debug-terminal.mjs',
  'cli/dist/pause.mjs',
  'cli/dist/polyfill.mjs',
  'cli/dist/stop-on-entry.mjs',
  'cli/dist/ts.js',
  'cli/package.json',
  'cli/types/nimblescape-globals/index.d.ts',
  'dist/extension.js',
  'dist/plugin.js',
  `node_modules/${plugin.name}/package.json`,
  'package.json',
  'resources/icon.png',
];

/** The folders that the package holds with all their files: the types of Node.js for ts and the editor plugin. */
const PACKAGE_FOLDERS = ['cli/node_modules/@types/node', 'cli/node_modules/undici-types'];

/** True for the bundles, which a build writes. */
const built = (file: string): boolean => file.startsWith('dist/') || file.startsWith('cli/dist/');

/** The lines of .vscodeignore without comments and empty lines. */
function ignoreLines(): string[] {
  return read('.vscodeignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** The modules that `entry` imports at run time, with the local modules that it reaches. */
function runtimeImports(entry: string): { local: Set<string>; packages: Set<string> } {
  const pending = [entry];
  const local = new Set<string>();
  const packages = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (local.has(file)) continue;
    local.add(file);
    for (const match of read(file).matchAll(/^import (?!type )[^;]*? from '([^']+)';$/gm)) {
      if (match[1].startsWith('.')) pending.push(path.posix.join(path.posix.dirname(file), match[1]));
      else packages.add(match[1]);
    }
  }
  return { local, packages };
}

describe('the manifest', () => {
  it('follows the naming scheme of the nimblescape extensions', () => {
    expect(manifest.publisher).toBe('nimblescape');
    expect(manifest.name).toBe('nimblescape-typescript');
    expect(manifest.displayName).toBe('nimblescape TypeScript');
    expect(manifest.license).toBe('MIT');
    expect(manifest.icon).toBe('resources/icon.png');
  });

  it('keeps @types/vscode at the lowest version of the engine range', () => {
    const engine = /^\^(\d+\.\d+)\.\d$/.exec(manifest.engines.vscode);
    expect(engine, 'engines.vscode has the form ^x.y.z').not.toBeNull();
    expect(manifest.devDependencies['@types/vscode']).toBe(`~${engine![1]}.0`);
  });

  it('runs in the workspace host, also in Restricted Mode, and not in virtual workspaces', () => {
    expect(manifest.extensionKind).toEqual(['workspace']);
    expect(manifest.capabilities.untrustedWorkspaces.supported).toBe('limited');
    expect(manifest.capabilities.virtualWorkspaces.supported).toBe(false);
    expect(manifest.activationEvents).toEqual(['onStartupFinished', 'workspaceContains:package.json', 'onDebugResolve:ts', 'onDebugDynamicConfigurations:ts']);
  });

  it('contributes the plugin for the TypeScript of VS Code and of the workspace', () => {
    expect(manifest.contributes.typescriptServerPlugins).toEqual([{ name: plugin.name, enableForWorkspaceTypeScriptVersions: true }]);
    expect(plugin.name).toBe('nimblescape-typescript-plugin');
    expect(read('src/plugin.ts')).toContain(`const PLUGIN_NAME = '${plugin.name}';`);
  });

  it('declares only the plugin package of this repository as a runtime dependency', () => {
    // npm links node_modules/nimblescape-typescript-plugin to plugin/, and vsce packages it from there.
    expect(manifest.dependencies).toEqual({ [plugin.name]: 'file:plugin' });
    expect(plugin.dependencies).toBeUndefined();
  });

  it('names dist/plugin.js as the plugin, as seen from node_modules/nimblescape-typescript-plugin', () => {
    const folder = path.posix.join('node_modules', plugin.name);
    expect(path.posix.normalize(path.posix.join(folder, plugin.main))).toBe('dist/plugin.js');
  });

  it('uses TypeScript 6.0.3 for the tools and the examples, the TypeScript of the courses and of VS Code', () => {
    const examples = JSON.parse(read('examples/package.json'));
    expect(manifest.devDependencies.typescript).toBe('6.0.3');
    expect(examples.devDependencies.typescript).toBe(manifest.devDependencies.typescript);
  });
});

describe('the package', () => {
  it('lists its files in .vscodeignore and keeps every file that VS Code and the TypeScript server load', () => {
    expect(manifest.main).toBe('./dist/extension.js');
    expect(manifest.files, 'the package lists its files in .vscodeignore').toBeUndefined();
    const ignore = ignoreLines();
    expect(ignore[0], '.vscodeignore ignores everything first').toBe('**');
    const kept = [...PACKAGE_FILES.map((file) => `!${file}`), ...PACKAGE_FOLDERS.map((folder) => `!${folder}/**`)];
    expect(ignore.slice(1).sort()).toEqual(kept.sort());
    for (const line of ignore.slice(1)) {
      const file = line.slice(1).replace(/\/\*\*$/, '');
      if (!built(file)) expect(fs.existsSync(path.join(repository, file)), `${file} exists (npm ci --prefix cli installs cli/node_modules)`).toBe(true);
    }
  });

  it('holds exactly these files, also the plugin package from node_modules (vsce ls)', () => {
    const vsce = path.join(repository, 'node_modules', '@vscode', 'vsce', 'vsce');
    const listed = execFileSync(process.execPath, [vsce, 'ls'], { cwd: repository, encoding: 'utf8' });
    // vsce ls lists the files that exist; CI runs the unit tests before the build, so the bundles may be missing.
    const expected = PACKAGE_FILES.filter((file) => !built(file) || fs.existsSync(path.join(repository, file)));
    const files = listed.split('\n').filter(Boolean);
    const inFolders = (file: string) => PACKAGE_FOLDERS.some((folder) => file.startsWith(`${folder}/`));
    expect(files.filter((file) => !inFolders(file)).sort()).toEqual(expected.sort());
    for (const folder of PACKAGE_FOLDERS) {
      expect(files, `the package holds ${folder}`).toContain(`${folder}/package.json`);
    }
  }, 60_000);

  it('bundles every local module, and leaves out only the editor API and the built-in modules of Node.js', () => {
    const extension = runtimeImports('src/extension.ts');
    expect(extension.local.has('src/installCheck.ts'), 'the scan finds the modules that the entry point imports').toBe(true);
    for (const name of extension.packages) expect(name === 'vscode' || name.startsWith('node:'), `the bundle imports ${name}`).toBe(true);
    // The plugin gets TypeScript from the TypeScript server, and imports it for its types only.
    const server = runtimeImports('src/plugin.ts');
    expect(server.local.has('src/autoImportFilter.ts')).toBe(true);
    for (const name of server.packages) expect(name.startsWith('node:'), `the bundle of the plugin imports ${name}`).toBe(true);
    // The command ts loads TypeScript at run time from the folder that it finds (src/cli/typescript.ts).
    const entries = ['src/cli/ts.ts', 'src/runtime/polyfill.ts', 'src/runtime/debugTerminal.ts', 'src/runtime/stopOnEntry.ts', 'src/runtime/pause.ts'];
    for (const entry of entries) {
      for (const name of runtimeImports(entry).packages) expect(name.startsWith('node:'), `${entry} imports ${name}`).toBe(true);
    }
  });
});

describe('the npm package', () => {
  const cli = JSON.parse(read('cli/package.json'));
  /** The files of the npm package; the build writes dist/ and LICENSE (esbuild.mjs). */
  const NPM_FILES = [
    'LICENSE',
    'README.md',
    'package.json',
    'dist/ts.js',
    'dist/polyfill.mjs',
    'dist/debug-terminal.mjs',
    'dist/stop-on-entry.mjs',
    'dist/pause.mjs',
    'types/nimblescape-globals/index.d.ts',
  ];

  it('has the version of the extension, the command ts and a public scope', () => {
    expect(cli.name).toBe('@nimblescape/typescript');
    expect(cli.version, 'the release sets one version in both manifests').toBe(manifest.version);
    const lock = JSON.parse(read('cli/package-lock.json'));
    expect([lock.version, lock.packages[''].version]).toEqual([cli.version, cli.version]);
    expect(cli.bin).toEqual({ ts: 'dist/ts.js' });
    expect(cli.publishConfig).toEqual({ access: 'public' });
    expect(cli.license).toBe(manifest.license);
    expect(cli.repository).toEqual({ type: 'git', url: `git+${manifest.repository.url}`, directory: 'cli' });
  });

  it('holds exactly these files (npm pack --dry-run)', () => {
    const listed = execFileSync('npm', ['pack', './cli', '--dry-run', '--json'], { cwd: repository, encoding: 'utf8' });
    const files = (JSON.parse(listed) as { files: { path: string }[] }[])[0].files.map((file) => file.path);
    const built = (file: string) => file === 'LICENSE' || file.startsWith('dist/');
    const expected = NPM_FILES.filter((file) => !built(file) || fs.existsSync(path.join(repository, 'cli', file)));
    expect(files.sort()).toEqual(expected.sort());
  }, 60_000);
});

describe('the documents', () => {
  // The package keeps the Markdown links of its documents unchanged (--no-rewrite-relative-links). A relative link
  // outside code would therefore break on the Marketplace page and in the installed extension.
  it('link outside code to web addresses or fragments only, in the documents of the package', () => {
    for (const name of ['README.md', 'CHANGELOG.md', 'SUPPORT.md', 'cli/README.md']) {
      const text = read(name)
        .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '')
        .replace(/`[^`\n]*`/g, '');
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        expect(match[1], `${name} links to the relative target ${match[1]}`).toMatch(/^(https:\/\/|#)/);
      }
    }
  });

  it('link to files of the repository that exist', () => {
    for (const name of ['CONTRIBUTING.md', 'SUPPORT.md', 'docs/architecture.md', 'docs/security.md']) {
      const text = read(name).replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '');
      for (const match of text.matchAll(/\]\(([^)\s#]+)(#[^)\s]*)?\)/g)) {
        if (/^https?:\/\//.test(match[1])) continue;
        const target = path.join(path.dirname(path.join(repository, name)), match[1]);
        expect(fs.existsSync(target), `${name} links to ${match[1]}, which does not exist`).toBe(true);
      }
    }
  });
});

describe('the license headers', () => {
  const HEADER = [
    'SPDX-License-Identifier: MIT',
    '© 2026 Hannes Stauss (scalarion@nimblescape.com)',
    'Licensed under the MIT License. See LICENSE in the repository root for details.',
  ];

  /** The files below `dir` (relative to the repository), without the folders that tools write. */
  function files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(path.join(repository, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'out', '.vscode-test', '.git', 'images'].includes(entry.name)) out.push(...files(rel));
      } else out.push(rel);
    }
    return out;
  }

  it('start every source, script, workflow and configuration file', () => {
    const checked = files('.').filter(
      (f) => /\.(ts|mts|mjs|js|css|yml|sh|svg)$/.test(f) || /(^|\/)(\.gitignore|\.vscodeignore|tsconfig\.json|launch\.json|tasks\.json|settings\.json)$/.test(f),
    );
    expect(checked.length > 25, 'the scan finds the files').toBe(true);
    for (const file of checked) {
      const head = read(file).split('\n').slice(0, 6).join('\n');
      for (const line of HEADER) expect(head.includes(line), `${file} has no license header`).toBe(true);
    }
  });
});
