/**
 * A PHP type as a sorted list of alternatives, e.g. `['int', 'string', 'null']` for
 * `int|string|null`. Class names are written the way a view without a namespace sees them:
 * `Product` for a global class, `\App\Entities\Product` for a namespaced one.
 */
export type PhpType = readonly string[];

export const MIXED: PhpType = ['mixed'];

/** Builds a type from one or more alternatives, e.g. `phpType('string', 'null')`. */
export function phpType(...names: string[]): PhpType {
  return normalize(names);
}

/** Combines types: `string` and `null` give `string|null`. Anything with `mixed` stays `mixed`. */
export function unionTypes(...types: PhpType[]): PhpType {
  return normalize(types.flat());
}

export function isMixed(type: PhpType): boolean {
  return type.includes('mixed');
}

export function formatType(type: PhpType): string {
  return type.length === 0 ? 'mixed' : type.join('|');
}

function normalize(names: string[]): PhpType {
  const unique = [...new Set(names)];
  if (unique.length === 0 || unique.includes('mixed')) {
    return MIXED;
  }

  // Alphabetical order keeps the generated block stable, with `null` always last.
  return unique.sort((a, b) => {
    if (a === 'null' || b === 'null') {
      return a === 'null' ? 1 : -1;
    }
    return a.localeCompare(b);
  });
}
