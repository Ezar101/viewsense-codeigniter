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
