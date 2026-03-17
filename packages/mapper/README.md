# mahoraga-mapper

AST-based CSS selector to source file mapping.

## Installation

```bash
npm install mahoraga-mapper
```

## Features

- **AST parsing** via TypeScript Compiler API
- **CSS selector resolution** to file:line:column locations
- **Framework-agnostic** TSX/JSX support
- **Precise mapping** from user interactions to source code

## Usage

```typescript
import { mapSelectorToSource } from 'mahoraga-mapper';

const location = await mapSelectorToSource({
  selector: 'button.submit-form',
  projectRoot: '/path/to/project',
});

console.log(location);
// { file: '/path/to/project/src/components/Form.tsx', line: 42, column: 8 }
```

## Notes

Uses the TypeScript Compiler API at runtime for AST analysis.

## License

MIT

## Links

- [Main repository](https://github.com/thomasindrias/mahoraga)
- [Documentation](https://github.com/thomasindrias/mahoraga#readme)
