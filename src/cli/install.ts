// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The global install of TypeScript, when ts finds none (typescript.ts), and `ts --install-typescript`. The default
// version is the TypeScript of the newest stable VS Code, so that ts outside VS Code reports the same errors as the
// editor: ts reads the newest version of VS Code from update.code.visualstudio.com and the TypeScript of that version
// from the file extensions/package-lock.json of VS Code on GitHub. Offline, the default is the TypeScript that VS Code
// shipped when this release of ts was built (BUNDLED_TYPESCRIPT). In a terminal, ts lists every version of npm from
// TypeScript 6 on, without the nightly builds, and asks which one to install.

import { spawnSync } from 'node:child_process';
import { askText, canAsk } from './ask.ts';
import { MINIMUM_MAJOR } from './typescript.ts';

/** The TypeScript of the newest stable VS Code when this release was built; esbuild sets it from package.json. */
declare const BUNDLED_TYPESCRIPT: string;

/** The time that one request may take; ts falls back to BUNDLED_TYPESCRIPT after it. */
const TIMEOUT = 4000;

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/** The TypeScript of the newest stable VS Code, and that version of VS Code; undefined offline. */
export async function vscodeTypeScript(): Promise<{ typescript: string; vscode: string } | undefined> {
  try {
    const releases = await fetchJson('https://update.code.visualstudio.com/api/releases/stable');
    const vscode = Array.isArray(releases) && typeof releases[0] === 'string' ? releases[0] : undefined;
    if (!vscode) return undefined;
    const lock = (await fetchJson(`https://raw.githubusercontent.com/microsoft/vscode/${vscode}/extensions/package-lock.json`)) as {
      packages?: Record<string, { version?: string }>;
    };
    const typescript = lock.packages?.['node_modules/typescript']?.version;
    return typescript ? { typescript, vscode } : undefined;
  } catch {
    return undefined;
  }
}

/** The parts of a version for sorting: major, minor, patch, and the pre-release ('' for a release, which sorts last). */
function parts(version: string): [number, number, number, string] {
  const [core, pre = ''] = version.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number);
  return [major, minor, patch, pre];
}

export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  if (x[3] === y[3]) return 0;
  if (x[3] === '') return 1;
  if (y[3] === '') return -1;
  return x[3] < y[3] ? -1 : 1;
}

/** The versions that ts offers: TypeScript 6 and newer, releases, betas and release candidates, oldest first. */
export function offeredVersions(all: readonly string[]): string[] {
  return all
    .filter((version) => /^\d+\.\d+\.\d+(-(beta|rc)(\.\d+)?)?$/.test(version) && parts(version)[0] >= MINIMUM_MAJOR)
    .sort(compareVersions);
}

/** The versions of TypeScript on npm; undefined offline. */
async function npmVersions(): Promise<string[] | undefined> {
  try {
    // The short form of the package document (the one npm install reads) has the versions too.
    const document = (await fetchJson('https://registry.npmjs.org/typescript', {
      accept: 'application/vnd.npm.install-v1+json',
    })) as { versions?: Record<string, unknown> };
    return document.versions ? Object.keys(document.versions) : undefined;
  } catch {
    return undefined;
  }
}

/** The default version and the text that explains it. */
export async function defaultVersion(): Promise<{ version: string; reason: string }> {
  const online = await vscodeTypeScript();
  return online
    ? { version: online.typescript, reason: `the TypeScript of VS Code ${online.vscode}` }
    : { version: BUNDLED_TYPESCRIPT, reason: 'the TypeScript of VS Code when this ts was built; offline' };
}

/** The command that installs a version globally. */
export const installCommand = (version: string): string => `npm install --global typescript@${version}`;

/** Runs the global install of a version with npm; true when it worked. */
export function install(version: string): boolean {
  console.log(`> ${installCommand(version)}`);
  const result = spawnSync('npm', ['install', '--global', `typescript@${version}`], { stdio: 'inherit' });
  return result.status === 0;
}

/**
 * ts found no TypeScript: asks which version to install and installs it. Without a terminal, prints the command and
 * returns false.
 */
export async function offerInstall(): Promise<boolean> {
  const fallback = await defaultVersion();
  if (!canAsk()) {
    console.error(`ts needs TypeScript ${MINIMUM_MAJOR} or newer, and none is installed. Install it with:`);
    console.error(`  ${installCommand(fallback.version)}`);
    console.error('or with: ts --install-typescript');
    return false;
  }
  const versions = (await npmVersions()) ?? [];
  const offered = offeredVersions(versions);
  console.log(`ts needs TypeScript ${MINIMUM_MAJOR} or newer, and none is installed.`);
  if (offered.length > 0) console.log(`Versions on npm: ${offered.join(', ')}`);
  console.log(`The default is ${fallback.version}, ${fallback.reason}.`);
  const version = askText('Which version shall npm install globally?', fallback.version);
  if (offered.length > 0 && !offered.includes(version)) {
    console.error(`TypeScript ${version} is not one of the versions above.`);
    return false;
  }
  return install(version);
}
