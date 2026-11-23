# Architecture decisions

Short records of the main choices, so you can see why the project works the way it does.

## 1. VS Code: write a generated `@var` block into each view

**Context.** Two ways exist to tell a PHP language server (Intelephense, PHP Tools, Phpactor)
which variables a view receives:

- **A** - write a `/** @var Type $name */` block into the view file.
- **B** - provide our own completion and forward requests to the PHP server through a
  virtual document, without changing the file.

**Decision.** Approach A.

**Why.** It's the only approach that removes the "undefined variable" warning, because that
warning comes from the PHP language server and another extension can't hide it. It also gives
hover, go to definition and refactoring for free, and it works in every PHP tool that reads
PHPDoc, including PhpStorm and PHPStan.

**Consequences.** The block sits between `/* viewsense:start */` and `/* viewsense:end */`
markers, and ViewSense never changes anything outside them. Generated helper classes (for
example the type of `$this` in a CodeIgniter 3 view) go into a `.viewsense/` folder that
you add to `.gitignore`.

## 2. PHP parser: `php-parser`

**Decision.** Use the [`php-parser`](https://www.npmjs.com/package/php-parser) npm package.

**Why.** It's plain JavaScript with no runtime dependencies, no native module and no WASM file.
It keeps going when a file has syntax errors, and it gives the position of every node.
`web-tree-sitter` is more robust with the newest PHP syntax, but it ships a WASM binary of
about 1 MB.

**Consequences.** The parser stays behind a small internal interface, so you can replace it
later without touching the rest of the code.

## 3. `$this` in CodeIgniter 3 views: a generated class

**Context.** In a CodeIgniter 3 view, `$this` is the loader (`CI_Loader`). Through its magic
`__get()`, it also gives access to everything the controller can reach: `$this->session`,
loaded models and libraries. No existing class describes that.

**Decision.** Generate `.viewsense/ci3_view.php` with a `ViewSense_CI3_View` class that extends
`CI_Loader` and lists these properties with `@property`. Views that use `$this` get
`/** @var \ViewSense_CI3_View $this */`.

**Why.** A PHP language server can only learn about properties from a class. One class per
project keeps things simple: a view can't know which controller renders it, so it gets the
properties of all controllers, with the union of their types.

**Consequences.** The folder contains a `.gitignore` with `*`, so Git ignores it without any
change to the project's own `.gitignore`.

## 4. `$this` in CodeIgniter 4 views: a generated class too (0.1.1)

**Context.** In a CodeIgniter 4 view, `$this` is `CodeIgniter\View\View`. Its `extend()`,
`section()` and `endSection()` methods return `void`, but the CodeIgniter docs write
`<?= $this->extend('layout') ?>`. Once `$this` is typed, Intelephense reports each of these lines:
"Expected type 'string|Stringable|null'. Found 'void'".

**Decision.** Generate `.viewsense/ci4_view.php` with a `ViewSense_CI4_View` class that extends
`CodeIgniter\View\View` and declares these three methods with `@method null ...`.

**Why.** A `void` function returns `null` at runtime, so `null` is the true type of what `<?=`
prints. Tested with Intelephense: the `@method` lines take over the inherited signatures, and the
other methods of the view renderer still complete.

## 5. Fully qualified class names in the blocks (0.1.1)

**Context.** PHP Namespace Resolver, a popular extension, reports a global class written without
a leading backslash (`Product`) as "not imported", even in a view without a namespace.

**Decision.** Write every class name with a leading backslash: `\Product`, `\ViewSense_CI3_View`.

**Why.** In a file without a namespace, both forms mean the same class, so nothing changes for
PHP or for the PHP language server, and the false warnings go away.
