# Contributing to ViewSense for CodeIgniter

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Report a bug

[Open an issue](https://github.com/Ezar101/viewsense-codeigniter/issues/new/choose) with the
bug report form. The most useful reports include:

- your editor and its version, the PHP extension you use (Intelephense, PHP Tools...) and the
  CodeIgniter version,
- a small controller and view that show the problem, and the block you expected,
- the lines of the **ViewSense** output channel (**View > Output**, then pick **ViewSense**).

To report a security problem, don't open a public issue: see the [security policy](SECURITY.md).

## Suggest a feature

Open an issue with the feature request form and describe the CodeIgniter code you write today,
and what you'd like the editor to know about it. A real example helps more than a general idea.

## Set up the project

The repository holds the VS Code extension in [`vscode/`](vscode/), the shared test projects in
[`fixtures/`](fixtures/) and the documentation in [`docs/`](docs/). The PhpStorm plugin will come
later in `phpstorm/`.

You need Node.js 22.12 or later and Git.

```sh
git clone https://github.com/Ezar101/viewsense-codeigniter.git
cd viewsense-codeigniter/vscode
npm install
npm run check
```

[`docs/development.md`](docs/development.md) explains how to run the extension (`F5`), the unit
tests and the integration tests.

## Make a change

1. Fork the repository and create a branch from `main`.
2. Make your change, with tests:
   - analysis code (`vscode/src/core/`): unit tests in `vscode/test/`, run with `npm test`,
   - VS Code behavior (`vscode/src/vscode/`): integration tests in `vscode/integration/`, run
     with `npm run test:integration`,
   - a new CodeIgniter pattern: add it to the fixture projects in `fixtures/` too, and to the
     table in `fixtures/README.md`.
3. Run `npm run check`: type check, ESLint, Prettier and the unit tests must pass.
4. For a change users can see, add a line under `Unreleased` in `vscode/CHANGELOG.md`.
5. Open a pull request and fill in its template.

The CI runs the same checks, and the integration tests on Linux and Windows.

### Code style

- TypeScript in strict mode. ESLint and Prettier settle style questions:
  `npm run lint` and `npm run format`.
- Code, comments, commit messages and documentation are in English: American spelling, short
  sentences, simple words.
- Comments explain why, not what the code already says.
- Keep `vscode/src/core/` free of any `vscode` import, so it stays testable with Vitest alone.

### Commit messages

- A short subject in the imperative mood: "Add CodeIgniter 4 cells support", not "Added..."
- 50 characters or fewer when possible, 72 at most, and no period at the end.
- If needed, a body after a blank line that explains why, wrapped at 72 characters.

## Releases

Maintainers publish releases with a version tag: see [`docs/publishing.md`](docs/publishing.md).
