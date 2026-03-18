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
        // TODO: Target 80%. Remaining gap is in executor.ts and worktree.ts (shell/git I/O).
        lines: 55,
        functions: 63,
        branches: 44,
        statements: 55,
      },
    },
  },
});
