import { describe, expect, it } from 'vitest';
import { buildClassIndex } from '../../../src/core/php/indexClasses';
import { formatType } from '../../../src/core/types/phpType';
import { findViewCalls } from '../../../src/core/views/findViewCalls';

/**
 * Builds the index from several snippets (one per file), then gives the type of each variable
 * passed to the views of the last snippet.
 */
function viewTypes(...files: string[]): Record<string, string> {
  const sources = files.map((code, index) => ({
    code: `<?php\n${code}`,
    path: `${String(index)}.php`,
  }));
  const classes = buildClassIndex(sources);
  const last = sources.at(-1);
  if (last === undefined) {
    return {};
  }

  const variables = findViewCalls(last.code, last.path, classes).flatMap((call) => call.variables);
  return Object.fromEntries(variables.map(({ name, type }) => [name, formatType(type)]));
}

const PRODUCT_MODEL = `
  /**
   * @method Product[] get_latest(int $limit)
   */
  class Product_model extends CI_Model {
    /** @return Product[] */
    public function get_all(): array { return []; }
    public function find(int $id): ?Product { return null; }
    public function count() { return 0; }
  }
`;

describe('properties and methods', () => {
  it('reads @property on the class and its parents', () => {
    const base = '/** @property Cart $cart */ class MY_Controller extends CI_Controller {}';
    const controller = `
      /** @property Product_model $products */
      class Products extends MY_Controller {
        public function index() {
          view('list', ['products' => $this->products, 'cart' => $this->cart]);
        }
      }
    `;
    expect(viewTypes(base, controller)).toEqual({ products: 'Product_model', cart: 'Cart' });
  });

  it('reads typed properties, @var properties and $this assignments', () => {
    const controller = `
      namespace App\\Controllers;
      use App\\Models\\ProductModel;
      use App\\Libraries\\Cart;
      class Shop {
        private ProductModel $products;
        /** @var Cart */
        protected $cart;
        private $session;
        private ?string $title = null;
        public function __construct() { $this->session = new \\App\\Libraries\\Session(); }
        public function index() {
          return view('shop', [
            'products' => $this->products,
            'cart' => $this->cart,
            'session' => $this->session,
            'title' => $this->title,
            'unknown' => $this->missing,
          ]);
        }
      }
    `;
    expect(viewTypes(controller)).toEqual({
      products: '\\App\\Models\\ProductModel',
      cart: '\\App\\Libraries\\Cart',
      session: '\\App\\Libraries\\Session',
      title: 'string|null',
      unknown: 'mixed',
    });
  });

  it('reads @return, native return types and @method', () => {
    const controller = `
      /** @property Product_model $products */
      class Products {
        public function index() {
          view('list', [
            'all' => $this->products->get_all(),
            'one' => $this->products->find(1),
            'latest' => $this->products->get_latest(3),
            'count' => $this->products->count(),
            'missing' => $this->products->nothing(),
          ]);
        }
      }
    `;
    expect(viewTypes(PRODUCT_MODEL, controller)).toEqual({
      all: 'Product[]',
      one: 'Product|null',
      latest: 'Product[]',
      count: 'mixed',
      missing: 'mixed',
    });
  });

  it('follows method calls on local variables and chains', () => {
    const code = `
      class Category { public function name(): string { return ''; } }
      class Product { public ?Category $category = null; public function category(): Category { return new Category(); } }
      function show(Product $product) {
        view('show', [
          'category' => $product->category,
          'name' => $product->category()->name(),
          'nullsafe' => $product->category?->name(),
        ]);
      }
    `;
    expect(viewTypes(code)).toEqual({
      category: 'Category|null',
      name: 'string',
      nullsafe: 'string|null',
    });
  });

  it('reads static calls and parent::', () => {
    const code = `
      class Base { public static function make(): static { return new static(); } }
      class Product extends Base {
        public static function featured(): self { return new self(); }
        public function index() {
          view('show', ['made' => Product::make(), 'featured' => self::featured(), 'parent' => parent::make()]);
        }
      }
    `;
    expect(viewTypes(code)).toEqual({ made: 'Base', featured: 'Product', parent: 'Base' });
  });

  it('ignores method calls on scalar types', () => {
    expect(viewTypes("$name = 'Ada'; view('home', ['x' => $name->length()]);")).toEqual({
      x: 'mixed',
    });
  });
});

describe('CodeIgniter 3 loader', () => {
  it('knows what $this->load->model() and ->library() load', () => {
    const controller = `
      class Shop extends CI_Controller {
        public function __construct() {
          parent::__construct();
          $this->load->model('product_model');
          $this->load->model('admin/User_model', 'users');
          $this->load->model(['order_model', 'category_model' => 'categories']);
          $this->load->library('cart');
          $this->load->library('email', [], 'mailer');
          $this->load->database();
        }
        public function index() {
          view('shop', [
            'products' => $this->product_model,
            'users' => $this->users,
            'orders' => $this->order_model,
            'categories' => $this->categories,
            'cart' => $this->cart,
            'mailer' => $this->mailer,
            'db' => $this->db,
          ]);
        }
      }
    `;
    expect(viewTypes(controller)).toEqual({
      products: 'Product_model',
      users: 'User_model',
      orders: 'Order_model',
      categories: 'Category_model',
      cart: 'Cart',
      mailer: 'Email',
      db: 'CI_DB_query_builder',
    });
  });

  it('shares loaded models with other files and with views', () => {
    const base =
      "class MY_Controller { public function __construct() { $this->load->model('product_model'); } }";
    const view = "$this->load->view('partial', ['latest' => $this->product_model->get_latest(1)]);";
    expect(viewTypes(PRODUCT_MODEL, base, view)).toEqual({ latest: 'Product[]' });
  });
});

describe('CodeIgniter 4 models', () => {
  const ENTITY_MODEL = `
    namespace App\\Models;
    use App\\Entities\\Product;
    use CodeIgniter\\Model;
    class ProductModel extends Model {
      protected $returnType = Product::class;
      public function featured(): array { return []; }
    }
  `;

  it('types find(), first(), findAll() and chained queries from $returnType', () => {
    const controller = `
      namespace App\\Controllers;
      use App\\Models\\ProductModel;
      class Products {
        public function index() {
          $model = model(ProductModel::class);
          return view('list', [
            'one' => $model->find(1),
            'first' => $model->where('active', 1)->first(),
            'all' => $model->orderBy('name')->limit(10)->findAll(),
            'own' => $model->featured(),
            'byName' => model('ProductModel'),
            'byFullName' => model('App\\Models\\ProductModel'),
          ]);
        }
      }
    `;
    expect(viewTypes(ENTITY_MODEL, controller)).toEqual({
      one: '\\App\\Entities\\Product|null',
      first: '\\App\\Entities\\Product|null',
      all: '\\App\\Entities\\Product[]',
      own: 'array',
      byName: '\\App\\Models\\ProductModel',
      byFullName: '\\App\\Models\\ProductModel',
    });
  });

  it("uses CodeIgniter's 'array' default and inherited $returnType", () => {
    const models = `
      namespace App\\Models;
      class BaseModel extends \\CodeIgniter\\Model { protected $returnType = 'object'; }
      class UserModel extends BaseModel {}
      class TagModel extends \\CodeIgniter\\Model {}
    `;
    const controller = `
      use App\\Models\\UserModel;
      use App\\Models\\TagModel;
      view('list', ['users' => (new UserModel())->findAll(), 'tags' => (new TagModel())->findAll()]);
    `;
    expect(viewTypes(models, controller)).toEqual({ users: 'object[]', tags: 'array[]' });
  });

  it('leaves model() unknown when two classes have the same short name', () => {
    const models = 'namespace A; class UserModel {} namespace B; class UserModel {}';
    expect(viewTypes(models, "view('x', ['m' => model('UserModel')]);")).toEqual({ m: 'mixed' });
  });
});
