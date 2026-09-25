import { defineConfig } from 'vitest/config';

// Unit tests: *.test.ts next to the code in each package and in the app.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
