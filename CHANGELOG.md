# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The VS Code extension and the PhpStorm plugin have their own changelogs in their folders.

## [Unreleased]

### Added

- Repository layout, license and CodeIgniter 3 and 4 test fixtures.
- VS Code: find `$this->load->view()` and `view()` calls and the variables they pass.
- VS Code: guess variable types from literals, casts, `new`, parameters and local variables.
- VS Code: merge the variables of a view loaded from several places.
- VS Code: write and update the generated `@var` block at the top of a view.
- VS Code: "ViewSense: Update View Hints" command for CodeIgniter 3 and 4 projects.
- VS Code: read types from other files: typed properties, `@property`, `@var`, `@return`,
  `@method`, native return types, CodeIgniter 3 loaded models and libraries, CodeIgniter 4
  `model()` and model `$returnType`.
- VS Code: type `$this` in views (`CodeIgniter\View\View` in CodeIgniter 4, a generated
  `ViewSense_CI3_View` class in CodeIgniter 3).
- VS Code: CodeIgniter 3 `$this->load->vars()`, shared with the views of the class and its
  children.
- VS Code: CodeIgniter 4 renderer: `setVar()`, `setData()` and `render()`, and `$this->include()`.
- VS Code: partial views get the variables of the view that includes them, and `foreach` items
  get the type of the array items.
