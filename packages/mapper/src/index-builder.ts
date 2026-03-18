import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { scanFile } from './ast-scanner.js';
import { scanRoutes } from './route-scanner.js';
import type { CodeMapIndex } from './mapper.js';

/** Default glob patterns for scanning source files. */
const DEFAULT_PATTERNS = ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'];

/** Default directories/patterns to ignore. */
const DEFAULT_IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'];

/**
 * Builds a CodeMapIndex by scanning source files and saves it to disk.
 * @param rootDir - The root directory to scan.
 * @param outputPath - The path to write the JSON index file to.
 * @param patterns - Optional glob patterns to use instead of defaults.
 * @returns The built CodeMapIndex.
 */
export async function buildAndSave(
  rootDir: string,
  outputPath: string,
  patterns?: string[],
): Promise<CodeMapIndex> {
  const index = await buildIndex(rootDir, patterns);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf-8');

  return index;
}

/**
 * Loads a cached CodeMapIndex from disk.
 * @param outputPath - The path to the cached index JSON file.
 * @returns The loaded CodeMapIndex, or null if not found or invalid.
 */
export function loadFromCache(outputPath: string): CodeMapIndex | null {
  try {
    if (!fs.existsSync(outputPath)) {
      return null;
    }
    const content = fs.readFileSync(outputPath, 'utf-8');
    const data = JSON.parse(content) as CodeMapIndex;

    if (!data.entries || typeof data.builtAt !== 'number' || typeof data.rootDir !== 'string') {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Builds a CodeMapIndex by scanning source files in rootDir.
 * @param rootDir - The root directory to scan.
 * @param patterns - Optional glob patterns.
 * @returns The built CodeMapIndex.
 */
export async function buildIndex(
  rootDir: string,
  patterns?: string[],
): Promise<CodeMapIndex> {
  const globs = patterns ?? DEFAULT_PATTERNS;

  const files: string[] = [];
  for (const pattern of globs) {
    const matched = await glob(pattern, {
      cwd: rootDir,
      absolute: true,
      ignore: DEFAULT_IGNORE,
    });
    files.push(...matched);
  }

  // Deduplicate
  const uniqueFiles = [...new Set(files)];

  const entries: Record<string, import('./ast-scanner.js').SourceLocation[]> = {};

  // Scan each file for selectors
  for (const filePath of uniqueFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = scanFile(filePath, content);

      for (const [selector, location] of result.selectors) {
        if (!entries[selector]) {
          entries[selector] = [];
        }
        entries[selector]!.push(location);
      }
    } catch {
      // Skip files that can't be read or parsed
    }
  }

  // Scan routes
  const routeMap = scanRoutes(rootDir, uniqueFiles);
  for (const [urlPattern, location] of routeMap) {
    const routeSelector = `route:${urlPattern}`;
    if (!entries[routeSelector]) {
      entries[routeSelector] = [];
    }
    entries[routeSelector]!.push(location);
  }

  return {
    entries,
    builtAt: Date.now(),
    rootDir,
  };
}
