import { beforeEach, describe, expect, it } from 'vitest';
import { clearParseCache, parsePhp } from '../../../src/core/php/parser';

describe('parsePhp cache', () => {
  beforeEach(() => {
    clearParseCache();
  });

  it('gives the same AST again while the code of a file stays the same', () => {
    const first = parsePhp("<?php view('home');", 'Home.php');
    expect(parsePhp("<?php view('home');", 'Home.php')).toBe(first);
  });

  it('parses again when the code of the file changes', () => {
    const first = parsePhp("<?php view('home');", 'Home.php');
    const second = parsePhp("<?php view('about');", 'Home.php');

    expect(second).not.toBe(first);
    expect(JSON.stringify(second)).toContain('about');
  });

  it('keeps one entry per file name', () => {
    const home = parsePhp('<?php $a = 1;', 'Home.php');
    const shop = parsePhp('<?php $a = 1;', 'Shop.php');

    expect(shop).not.toBe(home);
    expect(parsePhp('<?php $a = 1;', 'Home.php')).toBe(home);
  });
});
