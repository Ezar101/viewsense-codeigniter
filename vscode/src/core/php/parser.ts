import { Engine } from 'php-parser';
import type { PhpNode } from './ast';

const engine = new Engine({
  parser: {
    php8: true,
    // Keep going after a syntax error, so a file you're still typing can be analyzed.
    suppressErrors: true,
    extractDoc: true,
  },
  ast: {
    withPositions: true,
  },
});

const EMPTY_PROGRAM: PhpNode = { kind: 'program', loc: null, children: [] };

/**
 * Parsing is the slowest part of an analysis, and most files don't change between two runs.
 * The cache keeps the AST of each file with the code it came from, and parses the file again
 * only when its code changes. The oldest entries go first when the cache is full.
 */
const MAX_CACHED_FILES = 5000;
const cache = new Map<string, { code: string; ast: PhpNode }>();

/**
 * Parses a PHP file (HTML and `<?php` tags allowed) and returns its AST. The AST is shared
 * between calls, so callers must not change it.
 * Never throws: a file the parser can't read at all gives an empty program.
 */
export function parsePhp(code: string, fileName: string): PhpNode {
  const cached = cache.get(fileName);
  if (cached?.code === code) {
    // Move the entry to the end: it's now the most recently used.
    cache.delete(fileName);
    cache.set(fileName, cached);
    return cached.ast;
  }

  const ast = parseUncached(code, fileName);
  cache.set(fileName, { code, ast });
  if (cache.size > MAX_CACHED_FILES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return ast;
}

/** Empties the cache, e.g. in tests. */
export function clearParseCache(): void {
  cache.clear();
}

function parseUncached(code: string, fileName: string): PhpNode {
  try {
    return engine.parseCode(code, fileName) as unknown as PhpNode;
  } catch {
    return EMPTY_PROGRAM;
  }
}
