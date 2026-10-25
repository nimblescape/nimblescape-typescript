// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { defineConfig } from 'vitest/config';

// The tests of the built command ts (npm run test:cli). They need the bundle cli/dist/ts.js, the packages of the npm
// package (npm ci --prefix cli) and the pinned TypeScript of the development tools.
export default defineConfig({
  test: {
    include: ['test/cli/**/*.test.ts'],
    environment: 'node',
    // A run of ts checks with TypeScript 6, which takes one to two seconds.
    testTimeout: 60_000,
  },
});
