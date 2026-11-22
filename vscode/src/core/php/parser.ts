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
 * Parses a PHP file (HTML and `<?php` tags allowed) and returns its AST.
 * Never throws: a file the parser can't read at all gives an empty program.
 */
export function parsePhp(code: string, fileName: string): PhpNode {
  try {
    return engine.parseCode(code, fileName) as unknown as PhpNode;
  } catch {
    return EMPTY_PROGRAM;
  }
}
