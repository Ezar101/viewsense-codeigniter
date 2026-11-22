import { describe, expect, it } from 'vitest';
import {
  parseDocTags,
  parseMethodTag,
  parsePropertyTag,
  splitLeadingType,
} from '../../../src/core/php/docblock';

describe('parseDocTags', () => {
  it('reads the tags of a multi-line docblock', () => {
    const docblock = `/**
     * Loads the products.
     *
     * @param int $limit How many
     * @return Product[] The products
     */`;
    expect(parseDocTags(docblock)).toEqual([
      { name: 'param', text: 'int $limit How many' },
      { name: 'return', text: 'Product[] The products' },
    ]);
  });

  it('reads a one-line docblock', () => {
    expect(parseDocTags('/** @var Cart */')).toEqual([{ name: 'var', text: 'Cart' }]);
  });

  it('reads tags with a dash, in lowercase', () => {
    expect(parseDocTags('/** @Property-Read int $id */')).toEqual([
      { name: 'property-read', text: 'int $id' },
    ]);
  });
});

describe('splitLeadingType', () => {
  it('keeps spaces inside brackets', () => {
    expect(splitLeadingType('array<int, Product> $list the list')).toEqual([
      'array<int,Product>',
      '$list the list',
    ]);
  });
});

describe('parsePropertyTag', () => {
  it('reads the type and the name', () => {
    expect(parsePropertyTag('Product_model $products The model')).toEqual({
      type: 'Product_model',
      name: 'products',
    });
  });

  it('rejects a tag without a type', () => {
    expect(parsePropertyTag('$products')).toBeNull();
  });
});

describe('parseMethodTag', () => {
  it.each([
    ['Product[] get_latest(int $limit)', { type: 'Product[]', name: 'get_latest' }],
    ['static Product make()', { type: 'Product', name: 'make' }],
    ['array<int, Product> recent()', { type: 'array<int,Product>', name: 'recent' }],
    ['refresh()', { type: 'void', name: 'refresh' }],
  ])('reads "%s"', (text, expected) => {
    expect(parseMethodTag(text)).toEqual(expected);
  });

  it('rejects a tag without a method name', () => {
    expect(parseMethodTag('Product')).toBeNull();
  });
});
