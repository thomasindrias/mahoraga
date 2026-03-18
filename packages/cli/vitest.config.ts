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
        lines: 14,
        functions: 17,
        branches: 16,
        statements: 14,
      },
    },
  },
});
