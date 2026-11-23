# Changelog

All notable changes to the VS Code extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-24

### Fixed

- CodeIgniter 4: no more "Expected type 'string|Stringable|null'. Found 'void'" warning on
  `<?= $this->extend() ?>`, `<?= $this->section() ?>` and `<?= $this->endSection() ?>`, the way
  the CodeIgniter docs write them. `$this` is now `ViewSense_CI4_View`, a class generated in
  `.viewsense/ci4_view.php`.
- Class names in the blocks start with a backslash (`\Product`), so PHP Namespace Resolver no
  longer reports them as "not imported".

## [0.1.0] - 2026-11-23

First preview release.

### Added

- "ViewSense: Update View Hints" command for CodeIgniter 3 and 4 projects: writes a
  `/** @var */` block with the variables each view receives, and their types.
- Types from literals, `new`, parameters, local variables, typed properties, `@property`, `@var`,
  `@return`, `@method`, loaded models and libraries (CodeIgniter 3), `model()` and model
  `$returnType` (CodeIgniter 4).
- `$this` in views.
- `$this->load->vars()`, the CodeIgniter 4 renderer, and partial views.
- `.viewsense.json` for your own render methods and helpers.
- Update on save (`viewsense.updateOnSave`) and warnings on out-of-date blocks.

[Unreleased]: https://github.com/Ezar101/viewsense-codeigniter/compare/vscode-v0.1.1...HEAD
[0.1.1]: https://github.com/Ezar101/viewsense-codeigniter/compare/vscode-v0.1.0...vscode-v0.1.1
[0.1.0]: https://github.com/Ezar101/viewsense-codeigniter/releases/tag/vscode-v0.1.0
