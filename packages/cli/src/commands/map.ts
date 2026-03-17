import { FileSystemCodeMapper } from '@mahoraga/mapper';
import { join } from 'node:path';

/**
 * Rebuild the code-to-event mapper index.
 * Scans the codebase for selectors and builds a selector → source file map.
 * @param cwd - Working directory (project root)
 */
export async function runMap(cwd: string): Promise<void> {
  console.log('Building code-to-event map...');

  const mapper = new FileSystemCodeMapper(cwd);
  await mapper.buildIndex(cwd);

  const index = mapper.getIndex();
  const entryCount = Object.keys(index.entries).length;

  // Save the index to .mahoraga/code-map.json
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const outputDir = join(cwd, '.mahoraga');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'code-map.json'),
    JSON.stringify(index, null, 2),
  );

  console.log(`Mapped ${entryCount} selectors to source files.`);
  console.log(`Index saved to .mahoraga/code-map.json`);
}
