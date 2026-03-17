import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanFile } from '../ast-scanner.js';
import { scanRoutes } from '../route-scanner.js';
import { FileSystemCodeMapper } from '../mapper.js';
import { buildAndSave, loadFromCache } from '../index-builder.js';

// ─── AST Scanner Tests ────────────────────────────────────────────────

describe('scanFile', () => {
  it('finds id attributes and maps to #selector', () => {
    const tsx = `
      export function App() {
        return <div id="main-content">Hello</div>;
      }
    `;
    const result = scanFile('app.tsx', tsx);

    expect(result.selectors.has('#main-content')).toBe(true);
    const loc = result.selectors.get('#main-content')!;
    expect(loc.filePath).toBe('app.tsx');
    expect(loc.line).toBeGreaterThan(0);
    expect(loc.column).toBeGreaterThan(0);
  });

  it('finds className attributes and maps each class to .selector', () => {
    const tsx = `
      const Card = () => (
        <div className="card card-primary shadow">Content</div>
      );
    `;
    const result = scanFile('card.tsx', tsx);

    expect(result.selectors.has('.card')).toBe(true);
    expect(result.selectors.has('.card-primary')).toBe(true);
    expect(result.selectors.has('.shadow')).toBe(true);
  });

  it('finds data-testid attributes and maps to attribute selector', () => {
    const tsx = `
      function LoginForm() {
        return <button data-testid="submit-btn">Submit</button>;
      }
    `;
    const result = scanFile('login.tsx', tsx);

    expect(result.selectors.has('[data-testid="submit-btn"]')).toBe(true);
  });

  it('finds data-cy attributes', () => {
    const tsx = `
      const Nav = () => <nav data-cy="main-nav">Links</nav>;
    `;
    const result = scanFile('nav.tsx', tsx);

    expect(result.selectors.has('[data-cy="main-nav"]')).toBe(true);
  });

  it('finds aria-label attributes', () => {
    const tsx = `
      const CloseBtn = () => <button aria-label="Close dialog">X</button>;
    `;
    const result = scanFile('close.tsx', tsx);

    expect(result.selectors.has('[aria-label="Close dialog"]')).toBe(true);
  });

  it('ignores dynamic expressions (template literals, variables)', () => {
    const tsx = `
      const dynamic = 'foo';
      function Comp() {
        return (
          <div>
            <span id={dynamic}>dynamic id</span>
            <span className={\`cls-\${dynamic}\`}>template</span>
            <span data-testid={getTestId()}>call</span>
          </div>
        );
      }
    `;
    const result = scanFile('dynamic.tsx', tsx);

    // Should find zero selectors since all are dynamic
    expect(result.selectors.size).toBe(0);
  });

  it('handles multiple elements in the same file', () => {
    const tsx = `
      export function Page() {
        return (
          <main id="page-root">
            <header className="header sticky">
              <h1 data-testid="title">Title</h1>
            </header>
            <section id="content" className="content-area">
              Body
            </section>
          </main>
        );
      }
    `;
    const result = scanFile('page.tsx', tsx);

    expect(result.selectors.has('#page-root')).toBe(true);
    expect(result.selectors.has('.header')).toBe(true);
    expect(result.selectors.has('.sticky')).toBe(true);
    expect(result.selectors.has('[data-testid="title"]')).toBe(true);
    expect(result.selectors.has('#content')).toBe(true);
    expect(result.selectors.has('.content-area')).toBe(true);
  });

  it('extracts componentName from function declarations', () => {
    const tsx = `
      function MyComponent() {
        return <div id="wrapper">Content</div>;
      }
    `;
    const result = scanFile('comp.tsx', tsx);
    const loc = result.selectors.get('#wrapper')!;
    expect(loc.componentName).toBe('MyComponent');
  });

  it('extracts componentName from arrow function variables', () => {
    const tsx = `
      const MyWidget = () => {
        return <span className="widget">W</span>;
      };
    `;
    const result = scanFile('widget.tsx', tsx);
    const loc = result.selectors.get('.widget')!;
    expect(loc.componentName).toBe('MyWidget');
  });

  it('handles JSX expression with string literal value', () => {
    const tsx = `
      function Comp() {
        return <div id={"static-value"}>Content</div>;
      }
    `;
    const result = scanFile('expr.tsx', tsx);
    expect(result.selectors.has('#static-value')).toBe(true);
  });
});

// ─── Route Scanner Tests ──────────────────────────────────────────────

describe('scanRoutes', () => {
  it('maps pages/ directory files to URL routes', () => {
    const rootDir = '/project';
    const files = [
      '/project/pages/index.tsx',
      '/project/pages/about.tsx',
      '/project/pages/blog/index.tsx',
      '/project/pages/blog/[slug].tsx',
    ];

    const routes = scanRoutes(rootDir, files);

    expect(routes.get('/')).toBeDefined();
    expect(routes.get('/about')).toBeDefined();
    expect(routes.get('/blog')).toBeDefined();
    expect(routes.get('/blog/:slug')).toBeDefined();
  });

  it('maps app/ directory files to URL routes', () => {
    const rootDir = '/project';
    const files = [
      '/project/app/page.tsx',
      '/project/app/dashboard/page.tsx',
      '/project/app/settings/profile/page.tsx',
    ];

    const routes = scanRoutes(rootDir, files);

    expect(routes.get('/')).toBeDefined();
    expect(routes.get('/dashboard')).toBeDefined();
    expect(routes.get('/settings/profile')).toBeDefined();
  });

  it('skips _app and _document files', () => {
    const rootDir = '/project';
    const files = [
      '/project/pages/_app.tsx',
      '/project/pages/_document.tsx',
      '/project/pages/index.tsx',
    ];

    const routes = scanRoutes(rootDir, files);

    expect(routes.size).toBe(1);
    expect(routes.get('/')).toBeDefined();
  });

  it('handles src/pages and src/app prefixes', () => {
    const rootDir = '/project';
    const files = [
      '/project/src/pages/about.tsx',
      '/project/src/app/dashboard/page.tsx',
    ];

    const routes = scanRoutes(rootDir, files);

    expect(routes.get('/about')).toBeDefined();
    expect(routes.get('/dashboard')).toBeDefined();
  });

  it('provides filePath in SourceLocation', () => {
    const rootDir = '/project';
    const files = ['/project/pages/about.tsx'];

    const routes = scanRoutes(rootDir, files);
    const loc = routes.get('/about')!;

    expect(loc.filePath).toBe('/project/pages/about.tsx');
    expect(loc.line).toBe(1);
    expect(loc.column).toBe(1);
  });
});

// ─── Full Mapper Integration ──────────────────────────────────────────

describe('FileSystemCodeMapper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mahoraga-mapper-test-'));

    // Create a sample TSX file
    const componentContent = `
      export function Header() {
        return (
          <header id="main-header" className="header sticky">
            <h1 data-testid="page-title">Welcome</h1>
          </header>
        );
      }
    `;
    fs.writeFileSync(path.join(tmpDir, 'Header.tsx'), componentContent);

    // Create a pages directory for route scanning
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'pages', 'index.tsx'),
      'export default function Home() { return <div>Home</div>; }',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'pages', 'about.tsx'),
      'export default function About() { return <div>About</div>; }',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds index and resolves selectors', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const results = mapper.resolve('#main-header');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.filePath).toContain('Header.tsx');
    expect(results[0]!.componentName).toBe('Header');
  });

  it('resolves class selectors', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const stickyResults = mapper.resolve('.sticky');
    expect(stickyResults.length).toBeGreaterThan(0);

    const headerResults = mapper.resolve('.header');
    expect(headerResults.length).toBeGreaterThan(0);
  });

  it('resolves data-testid selectors', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const results = mapper.resolve('[data-testid="page-title"]');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown selectors', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const results = mapper.resolve('#nonexistent');
    expect(results).toEqual([]);
  });

  it('includes route information in the index', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const index = mapper.getIndex();
    expect(index.entries['route:/']).toBeDefined();
    expect(index.entries['route:/about']).toBeDefined();
  });

  it('getIndex returns rootDir and builtAt', async () => {
    const mapper = new FileSystemCodeMapper(tmpDir);
    await mapper.buildIndex();

    const index = mapper.getIndex();
    expect(index.rootDir).toBe(tmpDir);
    expect(index.builtAt).toBeGreaterThan(0);
  });
});

// ─── Index Builder Serialization ──────────────────────────────────────

describe('index-builder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mahoraga-builder-test-'));

    fs.writeFileSync(
      path.join(tmpDir, 'Button.tsx'),
      `
        const Button = () => <button id="primary-btn" className="btn btn-primary">Click</button>;
      `,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildAndSave writes index to disk and loadFromCache reads it back', async () => {
    const outputPath = path.join(tmpDir, '.mahoraga', 'code-map.json');

    const index = await buildAndSave(tmpDir, outputPath);

    expect(index.entries['#primary-btn']).toBeDefined();
    expect(index.entries['.btn']).toBeDefined();
    expect(index.entries['.btn-primary']).toBeDefined();
    expect(index.rootDir).toBe(tmpDir);
    expect(index.builtAt).toBeGreaterThan(0);

    // Verify file was written
    expect(fs.existsSync(outputPath)).toBe(true);

    // Load from cache
    const cached = loadFromCache(outputPath);
    expect(cached).not.toBeNull();
    expect(cached!.entries['#primary-btn']).toBeDefined();
    expect(cached!.rootDir).toBe(tmpDir);
  });

  it('loadFromCache returns null for non-existent file', () => {
    const result = loadFromCache('/nonexistent/path/code-map.json');
    expect(result).toBeNull();
  });

  it('serialization round-trip preserves all data', async () => {
    const outputPath = path.join(tmpDir, '.mahoraga', 'code-map.json');

    const original = await buildAndSave(tmpDir, outputPath);
    const loaded = loadFromCache(outputPath)!;

    expect(loaded.entries).toEqual(original.entries);
    expect(loaded.builtAt).toBe(original.builtAt);
    expect(loaded.rootDir).toBe(original.rootDir);
  });
});
