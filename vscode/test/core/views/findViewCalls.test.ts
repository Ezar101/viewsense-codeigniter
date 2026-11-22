import { describe, expect, it } from 'vitest';
import { findViewCalls, type ViewCall } from '../../../src/core/views/findViewCalls';
import { readFixture } from '../../fixtures';

/** Keeps only what the tests compare: view name and variable names. */
function summarize(calls: ViewCall[]): { view: string; variables: string[] }[] {
  return calls.map((call) => ({
    view: call.view,
    variables: call.variables.map((variable) => variable.name),
  }));
}

function findInFixture(relativePath: string): { view: string; variables: string[] }[] {
  const { code, path } = readFixture(relativePath);
  return summarize(findViewCalls(code, path));
}

function findInSnippet(code: string): { view: string; variables: string[] }[] {
  return summarize(findViewCalls(`<?php\n${code}`, 'snippet.php'));
}

describe('findViewCalls on the CodeIgniter 3 fixture', () => {
  it('finds $this->load->view() calls with $data keys and inline arrays', () => {
    expect(findInFixture('ci3/application/controllers/Products.php')).toEqual([
      { view: 'products/list', variables: ['title', 'products', 'page'] },
      { view: 'products/show', variables: ['product', 'in_cart'] },
    ]);
  });

  it('finds the same view loaded by another controller', () => {
    expect(findInFixture('ci3/application/controllers/Dashboard.php')).toEqual([
      { view: 'products/list', variables: ['title', 'products', 'page'] },
    ]);
  });

  it('skips calls whose view name is a variable', () => {
    // render() loads `$view` (skipped) then the layout with the keys it adds itself.
    expect(findInFixture('ci3/application/core/MY_Controller.php')).toEqual([
      { view: 'layouts/main', variables: ['content'] },
    ]);
  });

  it('finds a partial loaded from a view', () => {
    expect(findInFixture('ci3/application/views/products/list.php')).toEqual([
      { view: 'partials/product_card', variables: ['product'] },
    ]);
  });
});

describe('findViewCalls on the CodeIgniter 4 fixture', () => {
  it('finds view() calls, including after return', () => {
    expect(findInFixture('ci4/app/Controllers/Products.php')).toEqual([
      { view: 'products/index', variables: ['title', 'products'] },
      { view: 'products/show', variables: ['product'] },
    ]);
  });

  it('finds a partial rendered with view() from a view', () => {
    expect(findInFixture('ci4/app/Views/products/index.php')).toEqual([
      { view: 'partials/product_card', variables: ['product'] },
    ]);
  });
});

describe('findViewCalls on code snippets', () => {
  it('accepts a fully qualified view() and removes the .php extension', () => {
    expect(findInSnippet("echo \\view('home.php', ['user' => $user]);")).toEqual([
      { view: 'home', variables: ['user'] },
    ]);
  });

  it('works with get_instance()->load->view()', () => {
    expect(findInSnippet("get_instance()->load->view('home', ['user' => $user]);")).toEqual([
      { view: 'home', variables: ['user'] },
    ]);
  });

  it('starts over when the data variable is assigned again', () => {
    const code = `
      $data = ['old' => 1];
      $data = ['user' => $user];
      $data['role'] = 'admin';
      view('home', $data);
    `;
    expect(findInSnippet(code)).toEqual([{ view: 'home', variables: ['user', 'role'] }]);
  });

  it('adds the keys of += without replacing the existing ones', () => {
    const code = `
      $data = ['title' => 'Home'];
      $data += ['title' => 'Ignored', 'user' => $user];
      view('home', $data);
    `;
    expect(findInSnippet(code)).toEqual([{ view: 'home', variables: ['title', 'user'] }]);
  });

  it('copies the keys of another array variable', () => {
    const code = `
      $defaults = ['title' => 'Home'];
      $data = $defaults;
      $data['user'] = $user;
      view('home', $data);
      view('other', $defaults);
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'home', variables: ['title', 'user'] },
      { view: 'other', variables: ['title'] },
    ]);
  });

  it('keeps the keys of each function apart', () => {
    const code = `
      class Pages {
        public function first() { $data['a'] = 1; view('first', $data); }
        public function second() { view('second', $data); }
      }
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'first', variables: ['a'] },
      { view: 'second', variables: [] },
    ]);
  });

  it('ignores keys that are not plain strings', () => {
    expect(findInSnippet("view('home', [$key => 1, 0 => 2, 'ok' => 3]);")).toEqual([
      { view: 'home', variables: ['ok'] },
    ]);
  });

  it('ignores other methods named view()', () => {
    expect(findInSnippet("$this->view('home', ['a' => 1]); $x->load->views('b');")).toEqual([]);
  });

  it('gives the line of the call', () => {
    const calls = findViewCalls("<?php\n\n$a = 1;\nview('home');\n", 'snippet.php');
    expect(calls.map((call) => call.line)).toEqual([4]);
  });

  it('does not throw on a file with a syntax error', () => {
    expect(() => findViewCalls("<?php\nview('home', [\n", 'broken.php')).not.toThrow();
  });
});
