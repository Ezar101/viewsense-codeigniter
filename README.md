<p align="center">
  <img src="vscode/images/icon.png" width="96" height="96" alt="ViewSense icon">
</p>

<h1 align="center">ViewSense for CodeIgniter</h1>

<p align="center">
  Your editor knows the variables your controllers pass to your CodeIgniter 3 and 4 views, and
  their types.
</p>

<p align="center">
  <a href="https://github.com/Ezar101/viewsense-codeigniter/actions/workflows/vscode.yml"><img src="https://github.com/Ezar101/viewsense-codeigniter/actions/workflows/vscode.yml/badge.svg" alt="CI"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ezar101.viewsense-codeigniter"><img src="https://img.shields.io/visual-studio-marketplace/v/ezar101.viewsense-codeigniter?label=VS%20Code%20Marketplace" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/ezar101/viewsense-codeigniter"><img src="https://img.shields.io/open-vsx/v/ezar101/viewsense-codeigniter?label=Open%20VSX" alt="Open VSX"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

## The problem

In a CodeIgniter project, a view receives its variables from a controller:

```php
// application/controllers/Products.php
$data['products'] = $this->products->get_all();
$this->load->view('products/list', $data);
```

Inside `application/views/products/list.php`, your editor doesn't know that `$products` exists,
so you get "undefined variable" warnings and no autocompletion, unless you write
`/** @var Product[] $products */` by hand at the top of every view.

ViewSense finds these calls for you and writes the `@var` lines, with the types it can infer.
Your PHP extension (Intelephense, PHP Tools...) does the rest.

## Tools

| Tool                         | Status          | Install                                                                                                                                                                            |
| ---------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [VS Code extension](vscode/) | Preview (0.1.0) | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ezar101.viewsense-codeigniter), [Open VSX](https://open-vsx.org/extension/ezar101/viewsense-codeigniter) |
| [PhpStorm plugin](phpstorm/) | Planned         |                                                                                                                                                                                    |

See the [extension README](vscode/README.md) for its features, settings and limitations.

## Repository layout

| Folder                   | Content                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| [`vscode/`](vscode/)     | VS Code extension (TypeScript)                                               |
| [`phpstorm/`](phpstorm/) | PhpStorm plugin (Kotlin), planned                                            |
| [`fixtures/`](fixtures/) | Small CodeIgniter 3 and 4 projects used by the automated tests               |
| [`docs/`](docs/)         | Configuration reference, design decisions, development and publishing guides |

## Contributing

Bug reports, ideas and pull requests are welcome. Read the [contributing guide](CONTRIBUTING.md)
to set up the project, and the [code of conduct](CODE_OF_CONDUCT.md). To report a security
problem, see the [security policy](SECURITY.md).

## License

[MIT](LICENSE)
