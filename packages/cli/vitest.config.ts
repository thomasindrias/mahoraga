import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts'],
      thresholds: {
        // TODO: Target 80%. Remaining gap is in main.ts and command handlers (CLI I/O, config loading).
        // V3: dismiss.ts + analyze.ts suppression/cost logic added untested branches.
        lines: 14,
        functions: 17,
        branches: 13,
        statements: 14,
      },
    },
  },
});
