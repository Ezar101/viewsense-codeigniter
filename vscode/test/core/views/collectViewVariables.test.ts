import { describe, expect, it } from 'vitest';
import { formatType } from '../../../src/core/types/phpType';
import { collectViewVariables } from '../../../src/core/views/collectViewVariables';
import { findViewCalls } from '../../../src/core/views/findViewCalls';
import { readFixture } from '../../fixtures';

function collectFromFixtures(...relativePaths: string[]): Record<string, Record<string, string>> {
  const calls = relativePaths.flatMap((relativePath) => {
    const { code, path } = readFixture(relativePath);
    return findViewCalls(code, path);
  });

  const views = collectViewVariables(calls);
  return Object.fromEntries(
    [...views].map(([view, variables]) => [
      view,
      Object.fromEntries([...variables].map(([name, type]) => [name, formatType(type)])),
    ]),
  );
}

describe('collectViewVariables', () => {
  it('merges the types of a view loaded by two controllers', () => {
    const views = collectFromFixtures(
      'ci3/application/controllers/Products.php',
      'ci3/application/controllers/Dashboard.php',
    );

    expect(views['products/list']).toEqual({
      title: 'string|null',
      products: 'mixed',
      page: 'int|string',
    });
    expect(views['products/show']).toEqual({ product: 'mixed', in_cart: 'mixed' });
  });

  it('keeps a variable that only some calls pass', () => {
    const calls = findViewCalls(
      "<?php view('home', ['title' => 'Home']); view('home', ['user' => 'Ada']);",
      'snippet.php',
    );
    const variables = collectViewVariables(calls).get('home');

    expect([...(variables?.keys() ?? [])]).toEqual(['title', 'user']);
  });
});
