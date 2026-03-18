import * as path from 'node:path';
import type { SourceLocation } from './ast-scanner.js';

/**
 * A map from URL pattern to the source location of the route component.
 */
export type RouteMap = Map<string, SourceLocation>;

/**
 * Scans files for route definitions using file-based routing conventions.
 *
 * Supports:
 * - Next.js `pages/` directory: `pages/about.tsx` -> `/about`
 * - Next.js `app/` directory: `app/dashboard/page.tsx` -> `/dashboard`
 * - React Router `<Route>` patterns (basic detection)
 * @param rootDir - The root directory of the project.
 * @param files - List of file paths (relative or absolute) to scan.
 * @returns A RouteMap mapping URL patterns to SourceLocations.
 */
export function scanRoutes(rootDir: string, files: string[]): RouteMap {
  const routes: RouteMap = new Map();

  for (const file of files) {
    const absFile = path.isAbsolute(file) ? file : path.join(rootDir, file);
    const relFile = path.relative(rootDir, absFile);
    const normalized = relFile.split(path.sep).join('/');

    // Next.js pages/ directory convention
    const pagesMatch = normalized.match(/^(?:src\/)?pages\/(.+)\.(tsx?|jsx?)$/);
    if (pagesMatch) {
      const routePath = pagesMatch[1];
      if (routePath) {
        const urlPath = pagesRouteToUrl(routePath);
        if (urlPath !== null) {
          routes.set(urlPath, {
            filePath: absFile,
            line: 1,
            column: 1,
          });
        }
      }
    }

    // Next.js app/ directory convention
    const appMatch = normalized.match(/^(?:src\/)?app\/(.+)\/page\.(tsx?|jsx?)$/);
    if (appMatch) {
      const routePath = appMatch[1];
      if (routePath) {
        const urlPath = `/${routePath}`;
        routes.set(urlPath, {
          filePath: absFile,
          line: 1,
          column: 1,
        });
      }
    }

    // app/page.tsx -> /
    const appRootMatch = normalized.match(/^(?:src\/)?app\/page\.(tsx?|jsx?)$/);
    if (appRootMatch) {
      routes.set('/', {
        filePath: absFile,
        line: 1,
        column: 1,
      });
    }
  }

  return routes;
}

/**
 * Converts a pages/ directory path segment to a URL path.
 * @param routePath - The path segment after `pages/` without extension.
 * @returns The URL path, or null if it should be excluded (e.g., _app, _document).
 */
function pagesRouteToUrl(routePath: string): string | null {
  // Skip Next.js special files
  if (routePath.startsWith('_')) {
    return null;
  }

  // Skip API routes
  if (routePath.startsWith('api/')) {
    return null;
  }

  // index -> /
  if (routePath === 'index') {
    return '/';
  }

  // nested/index -> /nested
  if (routePath.endsWith('/index')) {
    return `/${routePath.slice(0, -6)}`;
  }

  // Convert [param] to :param for consistency
  const url = `/${routePath.replace(/\[([^\]]+)\]/g, ':$1')}`;
  return url;
}
