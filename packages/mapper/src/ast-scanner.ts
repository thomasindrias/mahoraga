import ts from 'typescript';
import type { SourceLocation } from 'mahoraga-core';

export type { SourceLocation } from 'mahoraga-core';

/**
 * Result of scanning a file for selectors.
 */
export interface ScanResult {
  selectors: Map<string, SourceLocation>;
}

/**
 * Scans a TSX/JSX file for CSS selectors derived from JSX attributes.
 *
 * Extracts selectors from:
 * - `id="foo"` -> `#foo`
 * - `className="bar baz"` -> `.bar`, `.baz`
 * - `data-testid="submit"` -> `[data-testid="submit"]`
 * - `data-cy="login"` -> `[data-cy="login"]`
 * - `aria-label="Close"` -> `[aria-label="Close"]`
 *
 * Only handles string literal attribute values (not dynamic expressions).
 *
 * @param filePath - The file path used for source location reporting.
 * @param content - The file content to parse.
 * @returns A ScanResult with a map of selector string to SourceLocation.
 */
export function scanFile(filePath: string, content: string): ScanResult {
  const selectors = new Map<string, SourceLocation>();

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  /** Find the nearest enclosing function/class component name. */
  function findComponentName(node: ts.Node): string | undefined {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
        return current.name.text;
      }
      if (ts.isClassDeclaration(current) && current.name) {
        return current.name.text;
      }
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        // Check parent for variable declaration
        if (current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
          return current.parent.name.text;
        }
      }
      current = current.parent;
    }
    return undefined;
  }

  function makeLocation(node: ts.Node): SourceLocation {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return {
      filePath,
      line: line + 1,
      column: character + 1,
      componentName: findComponentName(node),
    };
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile);
      const initializer = node.initializer;

      // Only handle string literal values
      if (!initializer) {
        ts.forEachChild(node, visit);
        return;
      }

      let value: string | undefined;

      if (ts.isStringLiteral(initializer)) {
        value = initializer.text;
      } else if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteral(initializer.expression)) {
        value = initializer.expression.text;
      }

      if (value === undefined) {
        ts.forEachChild(node, visit);
        return;
      }

      const location = makeLocation(node);

      if (attrName === 'id') {
        selectors.set(`#${value}`, location);
      } else if (attrName === 'className') {
        const classes = value.split(/\s+/).filter(Boolean);
        for (const cls of classes) {
          selectors.set(`.${cls}`, location);
        }
      } else if (attrName === 'data-testid' || attrName === 'data-cy' || attrName === 'aria-label') {
        selectors.set(`[${attrName}="${value}"]`, location);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { selectors };
}
