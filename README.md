# ViewSense for CodeIgniter

Your editor knows the variables your controllers pass to your CodeIgniter views - and their types.

> **Status:** early development. Nothing is published yet.

## The problem

In a CodeIgniter project, a view receives its variables from a controller:

```php
// application/controllers/Products.php
$data['products'] = $this->product_model->get_all();
$this->load->view('products/list', $data);
```

Inside `application/views/products/list.php`, your editor doesn't know that `$products` exists,
so you get "undefined variable" warnings and no autocompletion - unless you write
`/** @var Product_model[] $products */` by hand at the top of every view.

ViewSense finds these calls for you and tells your editor which variables each view receives.

## Planned features

- CodeIgniter 3: `$this->load->view()`, `$this->load->vars()`, variables shared between views, `$this` in views
- CodeIgniter 4: `view()`, `$this->setVar()`, `setData()`, `$this` in views
- Your own render methods and helpers, set in a `.viewsense.json` file
- Type inference from local variables, `new`, typed properties, `@property`, `@return`, `@method`
- One view used by several controllers: the variable types are merged
- Partial views included in other views

## Repository layout

| Folder | Content |
|--------|---------|
| [`vscode/`](vscode/) | VS Code extension (TypeScript) |
| [`phpstorm/`](phpstorm/) | PhpStorm plugin (Kotlin) |
| [`fixtures/`](fixtures/) | Small CodeIgniter 3 and 4 projects used by the automated tests |
| [`docs/`](docs/) | Design notes and the `.viewsense.json` reference |

## License

[MIT](LICENSE)
