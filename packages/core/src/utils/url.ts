/**
 * Normalize a URL by matching against route patterns.
 * Strips query params and hash, normalizes trailing slashes,
 * and replaces dynamic segments with pattern placeholders.
 * @param url - URL string (full URL or pathname)
 * @param routePatterns - Array of route patterns (e.g., '/products/:id')
 * @returns Normalized pathname or original pathname if no pattern matches
 */
export function normalizeUrl(url: string, routePatterns: string[]): string {
  let pathname: string;

  try {
    // Handle full URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      pathname = new URL(url).pathname;
    } else {
      // Handle pathnames with query/hash
      const qIndex = url.indexOf('?');
      const hIndex = url.indexOf('#');
      let end = url.length;
      if (qIndex !== -1) end = Math.min(end, qIndex);
      if (hIndex !== -1) end = Math.min(end, hIndex);
      pathname = url.slice(0, end);
    }
  } catch {
    pathname = url;
  }

  // Normalize trailing slash (but keep root '/')
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  if (routePatterns.length === 0) return pathname;

  const segments = pathname.split('/');

  for (const pattern of routePatterns) {
    const patternSegments = pattern.split('/');

    if (segments.length !== patternSegments.length) continue;

    let matches = true;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const pat = patternSegments[i]!;

      if (pat.startsWith(':')) {
        // Dynamic segment — matches any non-empty string
        if (seg.length === 0) {
          matches = false;
          break;
        }
      } else if (seg !== pat) {
        matches = false;
        break;
      }
    }

    if (matches) return pattern;
  }

  return pathname;
}
