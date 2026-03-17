import type { SourceLocation } from './ast-scanner.js';
import { buildIndex } from './index-builder.js';

export type { SourceLocation } from './ast-scanner.js';

/**
 * An index mapping CSS selectors to source locations.
 */
export interface CodeMapIndex {
  entries: Record<string, SourceLocation[]>;
  builtAt: number;
  rootDir: string;
}

/**
 * Interface for resolving CSS selectors to source code locations.
 */
export interface CodeMapper {
  /** Resolve a selector to its source locations. */
  resolve(selector: string, url?: string): SourceLocation[];

  /** Build the index by scanning files in the root directory. */
  buildIndex(rootDir: string, patterns?: string[]): Promise<void>;

  /** Return the current code map index. */
  getIndex(): CodeMapIndex;
}

/**
 * File-system-based implementation of CodeMapper.
 *
 * Scans TSX/JSX files using the AST scanner and route scanner,
 * builds a selector-to-location mapping, and provides lookup.
 */
export class FileSystemCodeMapper implements CodeMapper {
  private index: CodeMapIndex;

  /**
   * Creates a new FileSystemCodeMapper.
   *
   * @param rootDir - The root directory of the project to scan.
   */
  constructor(private rootDir: string) {
    this.index = {
      entries: {},
      builtAt: 0,
      rootDir,
    };
  }

  /**
   * Resolves a CSS selector to source locations.
   *
   * If a URL is provided, route matches for that URL are included.
   *
   * @param selector - The CSS selector to resolve (e.g., `#foo`, `.bar`, `[data-testid="baz"]`).
   * @param url - Optional URL to match against route definitions.
   * @returns An array of matching SourceLocations.
   */
  resolve(selector: string, url?: string): SourceLocation[] {
    const results: SourceLocation[] = [];

    const direct = this.index.entries[selector];
    if (direct) {
      results.push(...direct);
    }

    // If a URL is provided, check for route matches
    if (url) {
      const routeKey = `route:${url}`;
      const routeMatch = this.index.entries[routeKey];
      if (routeMatch) {
        results.push(...routeMatch);
      }
    }

    return results;
  }

  /**
   * Builds the selector index by scanning files.
   *
   * @param rootDir - The root directory to scan. Defaults to the constructor rootDir.
   * @param patterns - Optional glob patterns for file discovery.
   */
  async buildIndex(rootDir?: string, patterns?: string[]): Promise<void> {
    const dir = rootDir ?? this.rootDir;
    this.index = await buildIndex(dir, patterns);
  }

  /**
   * Returns the current code map index.
   *
   * @returns The CodeMapIndex.
   */
  getIndex(): CodeMapIndex {
    return this.index;
  }
}
