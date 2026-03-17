import { defineConfig } from 'tsup';

// main.ts must be first — its `clean: true` wipes dist/ before index.ts writes into it
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
