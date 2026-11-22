# Test fixtures

Two small CodeIgniter projects that the automated tests of both the VS Code extension and the
PhpStorm plugin read. They're never installed or run: the CodeIgniter framework itself isn't
included, only the application code ViewSense analyzes.

Both projects model the same small shop, so you can compare how CodeIgniter 3 and 4 handle
the same situation.

## CodeIgniter 3 - [`ci3/`](ci3/)

Detected through `application/config/config.php`.

| Case | Where |
|------|-------|
| `$data['key'] = ...` then `$this->load->view()` | `Products::index()` |
| Inline array passed to `$this->load->view()` | `Products::show()` |
| Custom render method that wraps a layout | `MY_Controller::render()`, used by `Products::create()` |
| Variables shared with `$this->load->vars()` | `MY_Controller::__construct()` (`$site_name`) |
| Model loaded with an alias | `$this->load->model('Product_model', 'products')` |
| `@property` on a controller | `Products`, `Dashboard`, `MY_Controller` |
| `@return Product[]` and `@method` on a model | `Product_model` |
| Nullable return type | `Product_model::find()` |
| `new Product()` | `Products::create()` |
| One view, several controllers (type merge) | `products/list` from `Products` and `Dashboard` |
| Partial loaded from a view | `products/list` loads `partials/product_card` |
| Custom helper that includes a view | `include_view()` in `products/list` |
| `$this` in a view (loaded library) | `$this->cart` in `layouts/main` |

## CodeIgniter 4 - [`ci4/`](ci4/)

Detected through the `spark` file and `codeigniter4/framework` in `composer.json`.

| Case | Where |
|------|-------|
| `return view()` with an inline array | `Products::index()` |
| `$data['key'] = ...` then `view()` | `Products::show()` |
| `setVar()` and `setData()` on the renderer service | `Products::create()` |
| Typed property set with `model()` | `Products::$products` |
| Model `$returnType` | `ProductModel` returns `App\Entities\Product` |
| Partial with `view()` from a view | `products/index` loads `partials/product_card` |
| Partial with `$this->include()` (shares the parent data) | `products/show` |
| Layout with `$this->extend()` | `products/index` extends `layouts/main` |
