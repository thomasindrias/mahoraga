import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/main.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
]);
