import { describe, expect, it } from 'vitest';
import { formatType, phpType } from '../../../src/core/types/phpType';
import {
  analyzeViewFile,
  findViewCalls,
  type ViewCall,
} from '../../../src/core/views/findViewCalls';
import type { ViewCallRule } from '../../../src/core/project/config';
import { readFixture } from '../../fixtures';

interface CallSummary {
  view: string;
  variables: Record<string, string>;
}

/** Keeps only what the tests compare: view name, and each variable with its type. */
function summarize(calls: ViewCall[]): CallSummary[] {
  return calls.map((call) => ({
    view: call.view,
    variables: Object.fromEntries(
      call.variables.map((variable) => [variable.name, formatType(variable.type)]),
    ),
  }));
}

function findInFixture(relativePath: string): CallSummary[] {
  const { code, path } = readFixture(relativePath);
  return summarize(findViewCalls(code, path));
}

function findInSnippet(code: string): CallSummary[] {
  return summarize(findViewCalls(`<?php\n${code}`, 'snippet.php'));
}

/** Type of `$value` passed to a view after the given statements. */
function typeOf(statements: string): string {
  const [call] = findInSnippet(`${statements}\nview('home', ['value' => $value]);`);
  return call?.variables.value ?? 'no call found';
}

describe('findViewCalls on the CodeIgniter 3 fixture', () => {
  it('finds $this->load->view() calls with $data keys and inline arrays', () => {
    expect(findInFixture('ci3/application/controllers/Products.php')).toEqual([
      {
        view: 'products/list',
        variables: { title: 'string', products: 'mixed', page: 'int' },
      },
      { view: 'products/show', variables: { product: 'mixed', in_cart: 'mixed' } },
    ]);
  });

  it('finds the same view loaded by another controller', () => {
    expect(findInFixture('ci3/application/controllers/Dashboard.php')).toEqual([
      {
        view: 'products/list',
        variables: { title: 'null', products: 'mixed', page: 'string' },
      },
    ]);
  });

  it('skips calls whose view name is a variable', () => {
    // render() loads `$view` (skipped) then the layout with the key it adds itself.
    expect(findInFixture('ci3/application/core/MY_Controller.php')).toEqual([
      { view: 'layouts/main', variables: { content: 'mixed' } },
    ]);
  });

  it('finds a partial loaded from a view', () => {
    expect(findInFixture('ci3/application/views/products/list.php')).toEqual([
      { view: 'partials/product_card', variables: { product: 'mixed' } },
    ]);
  });
});

describe('findViewCalls on the CodeIgniter 4 fixture', () => {
  it('finds view() calls, including after return, and renderer calls', () => {
    expect(findInFixture('ci4/app/Controllers/Products.php')).toEqual([
      { view: 'products/index', variables: { title: 'string', products: 'mixed' } },
      { view: 'products/show', variables: { product: 'mixed' } },
      {
        view: 'products/form',
        variables: { title: 'string', product: '\\App\\Entities\\Product', errors: 'array' },
      },
    ]);
  });

  it('finds a partial rendered with view() from a view', () => {
    expect(findInFixture('ci4/app/Views/products/index.php')).toEqual([
      { view: 'partials/product_card', variables: { product: 'mixed' } },
    ]);
  });
});

describe('findViewCalls on code snippets', () => {
  it('accepts a fully qualified view() and removes the .php extension', () => {
    expect(findInSnippet("echo \\view('home.php', ['user' => 'Ada']);")).toEqual([
      { view: 'home', variables: { user: 'string' } },
    ]);
  });

  it('works with get_instance()->load->view()', () => {
    expect(findInSnippet("get_instance()->load->view('home', ['user' => 'Ada']);")).toEqual([
      { view: 'home', variables: { user: 'string' } },
    ]);
  });

  it('starts over when the data variable is assigned again', () => {
    const code = `
      $data = ['old' => 1];
      $data = ['user' => 'Ada'];
      $data['role'] = 'admin';
      view('home', $data);
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'home', variables: { user: 'string', role: 'string' } },
    ]);
  });

  it('adds the keys of += without replacing the existing ones', () => {
    const code = `
      $data = ['title' => 'Home'];
      $data += ['title' => 1, 'count' => 2];
      view('home', $data);
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'home', variables: { title: 'string', count: 'int' } },
    ]);
  });

  it('copies the keys of another array variable', () => {
    const code = `
      $defaults = ['title' => 'Home'];
      $data = $defaults;
      $data['count'] = 3;
      view('home', $data);
      view('other', $defaults);
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'home', variables: { title: 'string', count: 'int' } },
      { view: 'other', variables: { title: 'string' } },
    ]);
  });

  it('keeps the variables of each function apart', () => {
    const code = `
      class Pages {
        public function first() { $data['a'] = 1; $user = 'Ada'; view('first', $data); }
        public function second() { view('second', $data); view('third', ['user' => $user]); }
      }
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'first', variables: { a: 'int' } },
      { view: 'second', variables: {} },
      { view: 'third', variables: { user: 'mixed' } },
    ]);
  });

  it('ignores keys that are not plain strings', () => {
    expect(findInSnippet("view('home', [$key => 1, 0 => 2, 'ok' => 3]);")).toEqual([
      { view: 'home', variables: { ok: 'int' } },
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

describe('shared data, renderer and partials', () => {
  function sharedIn(
    code: string,
  ): { fromClass: string | null; variables: Record<string, string> }[] {
    return analyzeViewFile(`<?php\n${code}`, 'snippet.php').shared.map((entry) => ({
      fromClass: entry.fromClass,
      variables: Object.fromEntries(
        entry.variables.map((variable) => [variable.name, formatType(variable.type)]),
      ),
    }));
  }

  it('reads both forms of $this->load->vars()', () => {
    const code = `
      class MY_Controller {
        public function __construct() {
          $this->load->vars(['site_name' => 'Shop', 'year' => 2026]);
          $this->load->vars('debug', false);
        }
      }
    `;
    expect(sharedIn(code)).toEqual([
      { fromClass: 'MY_Controller', variables: { site_name: 'string', year: 'int' } },
      { fromClass: 'MY_Controller', variables: { debug: 'bool' } },
    ]);
  });

  it('collects setVar() and setData() on a renderer variable', () => {
    const code = `
      $renderer = service('renderer');
      $renderer->setVar('title', 'Shop');
      $renderer->setData(['count' => 3])->setVar('open', true);
      echo $renderer->render('shop');
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'shop', variables: { title: 'string', count: 'int', open: 'bool' } },
    ]);
  });

  it('reads a renderer chain and the other ways to get the renderer', () => {
    const code = `
      echo single_service('renderer')->setVar('a', 1)->render('one');
      echo \\Config\\Services::renderer()->setData(['b' => 'x'])->render('two');
      echo $this->renderer->setVar('c', 1.5)->render('three');
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'one', variables: { a: 'int' } },
      { view: 'two', variables: { b: 'string' } },
      { view: 'three', variables: { c: 'float' } },
    ]);
  });

  it('ignores render() on something that is not a renderer', () => {
    expect(findInSnippet("$this->render('products/form', ['a' => 1]);")).toEqual([]);
  });

  it('reads $this->include() as a partial without its own data', () => {
    expect(findInSnippet("echo $this->include('partials/card');")).toEqual([
      { view: 'partials/card', variables: {} },
    ]);
  });

  it('types a foreach item from the array it loops over, using the view variables', () => {
    const code =
      "<?php foreach ($products as $key => $product) { $this->load->view('card', ['product' => $product]); }";
    // `$products` is a variable the view receives: a list of products, or null.
    const initialVariables = new Map([['products', phpType('\\Product[]', 'null')]]);

    const calls = analyzeViewFile(code, 'list.php', { initialVariables }).calls;
    expect(summarize(calls)).toEqual([{ view: 'card', variables: { product: '\\Product' } }]);
  });

  it('records the class each call is in', () => {
    const calls = analyzeViewFile(
      "<?php namespace App\\Controllers; class Home { function index() { return view('home'); } }",
      'Home.php',
    ).calls;
    expect(calls.map((call) => call.fromClass)).toEqual(['App\\Controllers\\Home']);
  });
});

describe('project methods and functions from .viewsense.json', () => {
  const viewCalls: ViewCallRule[] = [
    { kind: 'method', name: 'render', viewArgument: 0, dataArgument: 1, layout: 'layouts/main' },
    { kind: 'function', name: 'include_view', viewArgument: 0, dataArgument: 1, layout: null },
    { kind: 'method', name: 'page', viewArgument: 1, dataArgument: null, layout: null },
  ];

  function findWithRules(code: string): CallSummary[] {
    return summarize(analyzeViewFile(`<?php\n${code}`, 'snippet.php', { viewCalls }).calls);
  }

  it('reads a configured method and renders its layout with the same data', () => {
    expect(findWithRules("$this->render('products/form', ['title' => 'New']);")).toEqual([
      { view: 'products/form', variables: { title: 'string' } },
      { view: 'layouts/main', variables: { title: 'string' } },
    ]);
  });

  it('reads a configured function, with a data variable', () => {
    const code = "$data['page'] = 2; include_view('partials/pagination', $data);";
    expect(findWithRules(code)).toEqual([
      { view: 'partials/pagination', variables: { page: 'int' } },
    ]);
  });

  it('uses the configured argument positions, and static calls', () => {
    expect(findWithRules("Layout::page('admin', 'dashboard', ['a' => 1]);")).toEqual([
      { view: 'dashboard', variables: {} },
    ]);
  });

  it('ignores names that are not configured, and keeps the CodeIgniter 4 renderer', () => {
    const code = `
      $this->display('home', ['a' => 1]);
      echo service('renderer')->setVar('b', 1)->render('shop');
    `;
    expect(findWithRules(code)).toEqual([{ view: 'shop', variables: { b: 'int' } }]);
  });

  it('skips a configured call whose view name is not a plain string', () => {
    expect(findWithRules("$this->render($view, ['a' => 1]);")).toEqual([]);
  });
});

describe('type inference', () => {
  it.each([
    ["$value = 'Ada';", 'string'],
    ['$value = "Hello $name";', 'string'],
    ['$value = 42;', 'int'],
    ['$value = 0x1F;', 'int'],
    ['$value = -3;', 'int'],
    ['$value = 1.5;', 'float'],
    ['$value = 1e3;', 'float'],
    ['$value = true;', 'bool'],
    ['$value = null;', 'null'],
    ['$value = [1, 2];', 'array'],
    ['$value = (int) $id;', 'int'],
    ['$value = (string) $id;', 'string'],
    ["$value = 'a' . $b;", 'string'],
    ['$value = $a === $b;', 'bool'],
    ['$value = !$a;', 'bool'],
    ["$value = $flag ? 'yes' : null;", 'string|null'],
    ["$value = $flag ? 1 : 'none';", 'int|string'],
    ["$name = null; $value = $name ?? 'guest';", 'string'],
    ['$value = $a + $b;', 'mixed'],
    ['$value = $this->products->find(1);', 'mixed'],
    ['$value = $unknown;', 'mixed'],
  ])('%s gives %s', (statements, expected) => {
    expect(typeOf(statements)).toBe(expected);
  });

  it('uses the declared type of a parameter', () => {
    const code = `
      function show(int $id, ?string $slug, Product|null $product, $raw) {
        view('show', ['id' => $id, 'slug' => $slug, 'product' => $product, 'raw' => $raw]);
      }
    `;
    expect(findInSnippet(code)).toEqual([
      {
        view: 'show',
        variables: { id: 'int', slug: 'string|null', product: '\\Product|null', raw: 'mixed' },
      },
    ]);
  });

  it('uses the type of the last assignment', () => {
    expect(typeOf("$value = 1; $value = 'now a string';")).toBe('string');
  });
});

describe('class names', () => {
  it('writes global classes with a leading backslash (CodeIgniter 3)', () => {
    expect(typeOf('$value = new Product();')).toBe('\\Product');
  });

  it('resolves imports, aliases, group imports and the current namespace', () => {
    const code = `
      namespace App\\Controllers;

      use App\\Entities\\Product;
      use App\\Libraries\\Cart as ShoppingCart;
      use App\\Models\\{UserModel, OrderModel as Orders};

      final class Shop {
        public function index() {
          return view('shop', [
            'product' => new Product(),
            'cart' => new ShoppingCart(),
            'users' => new UserModel(),
            'orders' => new Orders(),
            'local' => new Helper(),
            'sub' => new Product\\Variant(),
            'absolute' => new \\DateTimeImmutable(),
            'relative' => new namespace\\Helper(),
            'self' => new self(),
            'dynamic' => new $className(),
          ]);
        }
      }
    `;
    expect(findInSnippet(code)).toEqual([
      {
        view: 'shop',
        variables: {
          product: '\\App\\Entities\\Product',
          cart: '\\App\\Libraries\\Cart',
          users: '\\App\\Models\\UserModel',
          orders: '\\App\\Models\\OrderModel',
          local: '\\App\\Controllers\\Helper',
          sub: '\\App\\Entities\\Product\\Variant',
          absolute: '\\DateTimeImmutable',
          relative: '\\App\\Controllers\\Helper',
          self: '\\App\\Controllers\\Shop',
          dynamic: 'mixed',
        },
      },
    ]);
  });

  it('resolves class names in parameter types', () => {
    const code = `
      namespace App\\Controllers;
      use App\\Entities\\Product;
      function show(?Product $product) { view('show', ['product' => $product]); }
    `;
    expect(findInSnippet(code)).toEqual([
      { view: 'show', variables: { product: '\\App\\Entities\\Product|null' } },
    ]);
  });
});
