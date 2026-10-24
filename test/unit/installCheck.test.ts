// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The check of the TypeScript of a folder (src/installCheck.ts), with folders in a temporary folder.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TSSERVER, installCommand, installState, listsTypeScript } from '../../src/installCheck.ts';

const folders: string[] = [];

/** A new folder with the files of `files`, by their paths relative to the folder. */
function folder(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nimblescape-typescript-'));
  folders.push(root);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const manifest = (fields: object) => JSON.stringify({ name: 'course', private: true, ...fields });
const COURSE = manifest({ devDependencies: { typescript: '6.0.3' } });

afterEach(() => {
  for (const root of folders.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('the package.json of a folder', () => {
  it('lists typescript in the fields that npm installs', () => {
    expect(listsTypeScript(folder({ 'package.json': COURSE }))).toBe(true);
    expect(listsTypeScript(folder({ 'package.json': manifest({ dependencies: { typescript: '^6.0.0' } }) }))).toBe(true);
    expect(listsTypeScript(folder({ 'package.json': manifest({ optionalDependencies: { typescript: '6.0.3' } }) }))).toBe(true);
  });

  it('does not list typescript as a peer dependency, as another package or without a package.json', () => {
    expect(listsTypeScript(folder({ 'package.json': manifest({ peerDependencies: { typescript: '*' } }) }))).toBe(false);
    expect(listsTypeScript(folder({ 'package.json': manifest({ devDependencies: { 'typescript-eslint': '1.0.0' } }) }))).toBe(false);
    expect(listsTypeScript(folder({}))).toBe(false);
  });

  it('counts as no list when it is no JSON object', () => {
    expect(listsTypeScript(folder({ 'package.json': '{ "devDependencies": ' }))).toBe(false);
    expect(listsTypeScript(folder({ 'package.json': 'null' }))).toBe(false);
  });
});

describe('the state of a folder', () => {
  it('is missing when package.json lists typescript and the TypeScript server is missing', () => {
    expect(installState(folder({ 'package.json': COURSE, 'package-lock.json': '{}' }))).toBe('missing');
    // The folder of a package that is installed only in part.
    expect(installState(folder({ 'package.json': COURSE, 'node_modules/typescript/package.json': '{"version":"6.0.3"}' }))).toBe('missing');
  });

  it('is installed when the TypeScript server exists', () => {
    expect(installState(folder({ 'package.json': COURSE, [TSSERVER]: '' }))).toBe('installed');
  });

  it('is installed with a TypeScript that has no TypeScript server (TypeScript 7)', () => {
    expect(installState(folder({ 'package.json': COURSE, 'node_modules/typescript/package.json': '{"version":"7.0.2"}' }))).toBe('installed');
  });

  it('is none without typescript in package.json, and in a folder of another package manager than npm', () => {
    expect(installState(folder({ 'package.json': manifest({ dependencies: { 'es-toolkit': '1.0.0' } }) }))).toBe('none');
    for (const lock of ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', '.pnp.cjs']) {
      expect(installState(folder({ 'package.json': COURSE, [lock]: '' })), lock).toBe('none');
    }
    // A package-lock.json next to the lock file of another package manager: npm installs the folder.
    expect(installState(folder({ 'package.json': COURSE, 'package-lock.json': '{}', 'yarn.lock': '' }))).toBe('missing');
  });
});

describe('the install command', () => {
  it('is npm ci with a package-lock.json, else npm install', () => {
    expect(installCommand(folder({ 'package.json': COURSE, 'package-lock.json': '{}' }))).toBe('npm ci');
    expect(installCommand(folder({ 'package.json': COURSE }))).toBe('npm install');
  });
});
