# Configuration: `.viewsense.json`

ViewSense works without any configuration. Add a `.viewsense.json` file at the root of your
CodeIgniter project when you want to:

- tell ViewSense about your own methods and functions that render views,
- use other folder names than the CodeIgniter defaults,
- force the CodeIgniter version.

In VS Code, the file gets completion and checks as you type.

## Example

A CodeIgniter 3 project with a base controller that wraps each page in a layout, and a helper
that includes a partial from a view:

```php
// application/core/MY_Controller.php
protected function render(string $view, array $data = []): void
{
    $data['content'] = $this->load->view($view, $data, true);
    $this->load->view('layouts/main', $data);
}

// application/helpers/view_helper.php
function include_view(string $view, array $data = []): void
{
    get_instance()->load->view($view, $data);
}
```

```json
{
  "viewCalls": [
    { "method": "render", "view": 0, "data": 1, "layout": "layouts/main" },
    { "function": "include_view" }
  ]
}
```

Now `$this->render('products/form', ['title' => 'New product'])` gives `$title` to both
`products/form` and `layouts/main`.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `version` | `3` or `4` | detected | CodeIgniter version. |
| `appFolder` | string | `application` (CI3), `app` (CI4) | Folder with the application code, relative to the project root. ViewSense reads every PHP file in it. |
| `viewsFolder` | string | `views` (CI3) or `Views` (CI4) in the application folder | Folder CodeIgniter loads views from. |
| `viewCalls` | list | `[]` | Your own methods and functions that render views. |

ViewSense always understands what CodeIgniter itself provides:

- CodeIgniter 3: `$this->load->view()`, `$this->load->vars()`
- CodeIgniter 4: `view()`, `$this->include()`, and the renderer service (`setVar()`,
  `setData()`, `render()`)

## `viewCalls` entries

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `method` | string | | Name of a method: matches `$object->name()` and `Class::name()`. |
| `function` | string | | Name of a function: matches `name()`. |
| `view` | integer | `0` | Position of the view name argument, starting at 0. |
| `data` | integer or `null` | the argument after `view` | Position of the data argument, or `null` when the call passes no data. |
| `layout` | string | none | A layout view the method also renders with the same data. |

Each entry needs `method` or `function`, not both. Names ignore case, as in PHP.

ViewSense only follows calls whose view name is a plain string, such as `'products/form'`.

## Problems in the file

When the file has a problem, ViewSense still uses the valid settings, writes each problem in the
**ViewSense** output channel, and shows a warning after the update.
