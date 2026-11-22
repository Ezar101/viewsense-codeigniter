/**
 * Small helpers to read the AST produced by `php-parser`.
 *
 * The package ships class declarations that don't match the plain objects it returns, so we
 * use our own structural type and narrow it with the guards below.
 */

export interface PhpPosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface PhpLocation {
  readonly start: PhpPosition;
  readonly end: PhpPosition;
}

export interface PhpNode {
  readonly kind: string;
  readonly loc: PhpLocation | null;
  readonly [property: string]: unknown;
}

/** Keys that hold metadata, not child nodes. */
const NON_CHILD_KEYS = new Set(['loc', 'leadingComments', 'trailingComments']);

/** Node kinds that open a new variable scope in PHP. */
const FUNCTION_KINDS = new Set(['function', 'method', 'closure', 'arrowfunc']);

export function isNode(value: unknown): value is PhpNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

export function isFunctionLike(node: PhpNode): boolean {
  return FUNCTION_KINDS.has(node.kind);
}

/** Returns the direct children of a node, in source order. */
export function childNodes(node: PhpNode): PhpNode[] {
  const children: PhpNode[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (NON_CHILD_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      children.push(...value.filter(isNode));
    } else if (isNode(value)) {
      children.push(value);
    }
  }

  return children;
}

export interface Visitor {
  enter?(node: PhpNode): void;
  leave?(node: PhpNode): void;
}

/** Visits every node depth-first, calling `enter` before the children and `leave` after. */
export function walk(node: PhpNode, visitor: Visitor): void {
  visitor.enter?.(node);
  for (const child of childNodes(node)) {
    walk(child, visitor);
  }
  visitor.leave?.(node);
}

/** Value of a single or double quoted string without interpolation, e.g. `'products/list'`. */
export function stringValue(node: unknown): string | null {
  if (isNode(node) && node.kind === 'string' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

/** Name of a plain variable such as `$data`, without the dollar sign. */
export function variableName(node: unknown): string | null {
  if (isNode(node) && node.kind === 'variable' && typeof node.name === 'string') {
    return node.name;
  }
  return null;
}

/** Name of an identifier (`->view`) or a function name (`view`, `\view`). */
export function identifierName(node: unknown): string | null {
  if (
    isNode(node) &&
    (node.kind === 'identifier' || node.kind === 'name') &&
    typeof node.name === 'string'
  ) {
    return node.name.replace(/^\\/, '');
  }
  return null;
}

export function nodeArray(value: unknown): PhpNode[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}
