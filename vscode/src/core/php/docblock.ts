import { isNode } from './ast';

/** One tag of a PHPDoc comment, e.g. `@return Product[]` gives `{ name: 'return', text: 'Product[]' }`. */
export interface DocTag {
  readonly name: string;
  readonly text: string;
}

/** Tags of the last `/** ... *\/` comment placed right before a node, or `[]`. */
export function docTagsOf(node: unknown): DocTag[] {
  if (!isNode(node) || !Array.isArray(node.leadingComments)) {
    return [];
  }

  const docblock = node.leadingComments
    .filter(isNode)
    .filter((comment) => comment.kind === 'commentblock' && typeof comment.value === 'string')
    .map((comment) => String(comment.value))
    .filter((text) => text.startsWith('/**'))
    .at(-1);

  return docblock === undefined ? [] : parseDocTags(docblock);
}

export function parseDocTags(docblock: string): DocTag[] {
  const tags: DocTag[] = [];
  const body = docblock.replace(/^\/\*\*/, '').replace(/\*\/$/, '');

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*\*?\s?/, '').trim();
    const match = /^@([\w-]+)\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) {
      tags.push({ name: match[1].toLowerCase(), text: match[2] ?? '' });
    }
  }
  return tags;
}

/**
 * Reads the type at the start of a tag text and returns it with the rest of the text.
 * A type can hold spaces inside brackets: `array<int, Product> $list` gives
 * `['array<int,Product>', '$list']`.
 */
export function splitLeadingType(text: string): [type: string, rest: string] {
  let depth = 0;
  let index = 0;
  let type = '';

  for (; index < text.length; index += 1) {
    const char = text.charAt(index);
    if ('<({['.includes(char)) {
      depth += 1;
    } else if ('>)}]'.includes(char)) {
      depth = Math.max(0, depth - 1);
    } else if (/\s/.test(char)) {
      if (depth === 0) {
        break;
      }
      continue;
    }
    type += char;
  }
  return [type, text.slice(index).trim()];
}

/** `@property Cart $cart` gives `{ type: 'Cart', name: 'cart' }`. */
export function parsePropertyTag(text: string): { type: string; name: string } | null {
  const [type, rest] = splitLeadingType(text);
  const name = /^\$(\w+)/.exec(rest)?.[1];
  return name === undefined || type.startsWith('$') ? null : { type, name };
}

/**
 * `@method Product[] get_latest(int $limit)` gives `{ type: 'Product[]', name: 'get_latest' }`.
 * Without a return type, as in `@method get_latest()`, the type is `void`.
 */
export function parseMethodTag(text: string): { type: string; name: string } | null {
  const withoutStatic = text.replace(/^static\s+/, '');
  const bareName = /^(\w+)\s*\(/.exec(withoutStatic)?.[1];
  if (bareName !== undefined) {
    return { type: 'void', name: bareName };
  }

  const [type, rest] = splitLeadingType(withoutStatic);
  const name = /^(\w+)\s*\(/.exec(rest)?.[1];
  return name === undefined ? null : { type, name };
}
