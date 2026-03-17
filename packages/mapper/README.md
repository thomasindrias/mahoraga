# mahoraga-mapper

[![npm](https://img.shields.io/npm/v/mahoraga-mapper.svg)](https://www.npmjs.com/package/mahoraga-mapper)

AST-based CSS selector to source file mapping for [Mahoraga](https://github.com/thomasindrias/mahoraga).

## Install

```bash
npm install mahoraga-mapper
```

## What It Does

Maps CSS selectors (from analytics events like rage clicks) to the exact source file, line, and column where the element is defined. Uses the TypeScript Compiler API to parse TSX/JSX ASTs.

## Usage

```typescript
import { FileSystemCodeMapper } from 'mahoraga-mapper';

const mapper = new FileSystemCodeMapper('./src');
await mapper.buildIndex('./src', ['**/*.tsx']);

const locations = mapper.resolve('.btn-submit');
// [{ filePath: 'src/components/Form.tsx', line: 42, column: 8 }]
```

## How It Works

1. **Scan** — Parses TSX/JSX files via the TypeScript Compiler API
2. **Extract** — Finds `className`, `id`, and `data-*` attributes in JSX elements
3. **Index** — Builds a selector-to-location map with file:line:column precision
4. **Resolve** — Looks up any CSS selector against the index

## Exports

- `FileSystemCodeMapper` — Main class implementing the `CodeMapper` interface
- `scanFile()` — Low-level AST scanner for individual files
- `scanRoutes()` — Route definition scanner for URL-to-component mapping
- `buildIndex()` / `buildAndSave()` — Index construction utilities

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
