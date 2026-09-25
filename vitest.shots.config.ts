import { defineConfig } from 'vitest/config';

// Progress screenshots (tests/screenshots): MILESTONE=m3 pnpm screenshots
export default defineConfig({
  test: {
    include: ['tests/screenshots/**/*.shots.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
