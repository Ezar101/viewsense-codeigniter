import { classTypeName } from '../php/names';
import { MIXED, phpType, unionTypes, type PhpType } from './phpType';

/** Resolves a class name written in a docblock to its fully qualified name. */
export type ClassNameResolver = (name: string) => string;

/** Docblock type keywords and the name we use for them. */
const KEYWORDS: Readonly<Record<string, string>> = {
  array: 'array',
  bool: 'bool',
  boolean: 'bool',
  callable: 'callable',
  double: 'float',
  false: 'bool',
  float: 'float',
  int: 'int',
  integer: 'int',
  iterable: 'iterable',
  mixed: 'mixed',
  null: 'null',
  object: 'object',
  resource: 'mixed',
  string: 'string',
  true: 'bool',
  void: 'null',
};

/** Generic types whose last parameter is the type of their items: `array<int, Product>`. */
const LIST_TYPES = new Set(['array', 'list', 'non-empty-array', 'non-empty-list', 'iterable']);

/** Keywords that mean "the class this docblock belongs to". */
const SELF_TYPES = new Set(['self', 'static', '$this']);

/**
 * Reads a PHPDoc type such as `?Product`, `Product[]|null`, `array<int, Product>` or
 * `\App\Entities\Product` and returns it as a `PhpType`.
 * `selfClass` is the fully qualified name of the class for `self`, `static` and `$this`.
 */
export function parseDocType(
  text: string,
  resolveClass: ClassNameResolver,
  selfClass: string | null,
): PhpType {
  const trimmed = text.trim();
  if (trimmed === '') {
    return MIXED;
  }
  return unionTypes(
    ...splitTopLevel(trimmed, '|').map((part) => parseSingle(part, resolveClass, selfClass)),
  );
}

function parseSingle(
  text: string,
  resolveClass: ClassNameResolver,
  selfClass: string | null,
): PhpType {
  if (text.startsWith('?')) {
    return unionTypes(parseSingle(text.slice(1), resolveClass, selfClass), phpType('null'));
  }
  if (text.startsWith('(') && text.endsWith(')')) {
    return parseDocType(text.slice(1, -1), resolveClass, selfClass);
  }
  if (text.endsWith('[]')) {
    return arrayOf(parseSingle(text.slice(0, -2), resolveClass, selfClass));
  }

  const generic = /^([\w\\-]+)<(.+)>$/.exec(text);
  if (generic?.[1] !== undefined && generic[2] !== undefined) {
    const base = generic[1].toLowerCase();
    if (LIST_TYPES.has(base)) {
      const itemType = splitTopLevel(generic[2], ',').at(-1) ?? '';
      return arrayOf(parseDocType(itemType, resolveClass, selfClass));
    }
    // `Collection<Product>`: keep the class, drop its parameters.
    return parseSingle(generic[1], resolveClass, selfClass);
  }

  const lower = text.toLowerCase();
  if (SELF_TYPES.has(lower)) {
    return selfClass === null ? MIXED : phpType(classTypeName(selfClass));
  }
  const keyword = KEYWORDS[lower];
  if (keyword !== undefined) {
    return phpType(keyword);
  }
  if (!/^\\?[A-Za-z_][\w\\]*$/.test(text)) {
    // Shapes and other advanced syntax, e.g. `array{id: int}`.
    return /^array\{/i.test(text) ? phpType('array') : MIXED;
  }
  return phpType(classTypeName(resolveClass(text)));
}

/** `Product` gives `Product[]`. Items of unknown type give a plain `array`. */
export function arrayOf(itemType: PhpType): PhpType {
  if (itemType.includes('mixed')) {
    return phpType('array');
  }
  return phpType(...itemType.map((name) => `${name}[]`));
}

/** Splits on a separator that isn't inside brackets: `array<int, A>|B` on `|`. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of text) {
    if ('<({['.includes(char)) {
      depth += 1;
    } else if ('>)}]'.includes(char)) {
      depth -= 1;
    }
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '');
}
