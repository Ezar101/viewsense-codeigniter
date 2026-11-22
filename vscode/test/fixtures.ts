import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));

/** Reads a file of the shared `fixtures/` folder, e.g. `ci3/application/controllers/Products.php`. */
export function readFixture(relativePath: string): { code: string; path: string } {
  const path = FIXTURES_DIR + relativePath;
  return { code: readFileSync(path, 'utf8'), path };
}
