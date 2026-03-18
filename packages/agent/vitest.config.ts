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
        lines: 55,
        functions: 63,
        branches: 44,
        statements: 55,
      },
    },
  },
});
