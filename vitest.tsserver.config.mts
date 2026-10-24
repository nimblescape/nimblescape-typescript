// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { defineConfig } from 'vitest/config';

// The tests with the TypeScript server of the examples (npm run test:tsserver). They need the packages of the examples
// (npm ci --ignore-scripts --prefix examples) and the bundle dist/plugin.js.
export default defineConfig({
  test: {
    include: ['test/tsserver/**/*.test.ts'],
    environment: 'node',
    // The first request of a TypeScript server reads the types of every package of the examples.
    testTimeout: 60_000,
  },
});
