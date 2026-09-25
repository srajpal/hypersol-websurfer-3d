import { defineConfig } from 'vitest/config';

// End-to-end tests: Playwright drives the built Electron app.
// One app at a time, so windows never compete for focus or frame rate.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
