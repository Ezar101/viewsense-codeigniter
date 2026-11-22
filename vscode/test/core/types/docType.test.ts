import { describe, expect, it } from 'vitest';
import { parseDocType } from '../../../src/core/types/docType';
import { formatType } from '../../../src/core/types/phpType';

/** Resolves names as if the docblock were in `namespace App\Models;` with no imports. */
const resolve = (name: string): string =>
  name.startsWith('\\') ? name.slice(1) : `App\\Models\\${name}`;

function parse(text: string, selfClass: string | null = 'App\\Models\\ProductModel'): string {
  return formatType(parseDocType(text, resolve, selfClass));
}

describe('parseDocType', () => {
  it.each([
    ['int', 'int'],
    ['integer', 'int'],
    ['boolean', 'bool'],
    ['false', 'bool'],
    ['double', 'float'],
    ['void', 'null'],
    ['?string', 'string|null'],
    ['string|null', 'string|null'],
    ['Product', '\\App\\Models\\Product'],
    ['\\App\\Entities\\Product', '\\App\\Entities\\Product'],
    ['\\DateTime', 'DateTime'],
    ['Product[]', '\\App\\Models\\Product[]'],
    ['?Product[]', '\\App\\Models\\Product[]|null'],
    ['(Product|Category)[]', '\\App\\Models\\Category[]|\\App\\Models\\Product[]'],
    ['array<int, \\App\\Entities\\Product>', '\\App\\Entities\\Product[]'],
    ['list<\\App\\Entities\\Product>', '\\App\\Entities\\Product[]'],
    ['array<string, mixed>', 'array'],
    ['array{id: int, name: string}', 'array'],
    ['\\Collection<\\App\\Entities\\Product>', 'Collection'],
    ['string[]', 'string[]'],
    ['self', '\\App\\Models\\ProductModel'],
    ['$this', '\\App\\Models\\ProductModel'],
    ['', 'mixed'],
    ['int<0, max>', 'int'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(parse(text)).toBe(expected);
  });

  it('gives mixed for self outside a class', () => {
    expect(parse('static', null)).toBe('mixed');
  });
});
