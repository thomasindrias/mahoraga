import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../utils/url.js';

describe('normalizeUrl', () => {
  it('matches single dynamic segment', () => {
    expect(normalizeUrl('/products/123', ['/products/:id'])).toBe('/products/:id');
  });

  it('groups different IDs to same pattern', () => {
    expect(normalizeUrl('/products/456', ['/products/:id'])).toBe('/products/:id');
  });

  it('matches multiple dynamic segments', () => {
    expect(normalizeUrl('/users/42/posts/99', ['/users/:userId/posts/:postId'])).toBe('/users/:userId/posts/:postId');
  });

  it('passes through when no pattern matches', () => {
    expect(normalizeUrl('/about', ['/products/:id'])).toBe('/about');
  });

  it('strips query params before matching', () => {
    expect(normalizeUrl('/products/123?page=2', ['/products/:id'])).toBe('/products/:id');
  });

  it('strips hash before matching', () => {
    expect(normalizeUrl('/products/123#section', ['/products/:id'])).toBe('/products/:id');
  });

  it('normalizes trailing slash', () => {
    expect(normalizeUrl('/products/123/', ['/products/:id'])).toBe('/products/:id');
  });

  it('does not match when segment count differs', () => {
    expect(normalizeUrl('/products', ['/products/:id'])).toBe('/products');
  });

  it('returns original pathname with empty patterns', () => {
    expect(normalizeUrl('/products/123', [])).toBe('/products/123');
  });

  it('first matching pattern wins', () => {
    expect(normalizeUrl('/a/1', ['/a/:id', '/a/:name'])).toBe('/a/:id');
  });

  it('handles full URL with protocol', () => {
    expect(normalizeUrl('https://example.com/products/123', ['/products/:id'])).toBe('/products/:id');
  });

  it('preserves root path', () => {
    expect(normalizeUrl('/', [])).toBe('/');
  });

  it('handles query-only pathname passthrough', () => {
    expect(normalizeUrl('/search?q=test', [])).toBe('/search');
  });
});
