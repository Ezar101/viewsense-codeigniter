# Development

## VS Code extension

The extension lives in [`vscode/`](../vscode/). You need Node.js 22.12 or later.

```sh
cd vscode
npm install
npm run check   # type check, lint, format check and tests
npm run test:watch
```

To try the extension, open the repository root in VS Code and press `F5`. Pick
"Run extension on CodeIgniter 3 sandbox" (or 4). This builds the extension, copies
[`fixtures/`](../fixtures/) into `vscode/.sandbox/`, and opens that copy in a new VS Code window,
so the fixtures themselves never change. The sandbox is reset on each launch.

The analysis code lives in `vscode/src/core/` and doesn't depend on VS Code, so you can test it
with Vitest alone. The VS Code part lives in `vscode/src/extension.ts` and `vscode/src/vscode/`.

### Integration tests

The tests in `vscode/integration/` run inside a real VS Code, on a fresh copy of each fixture
project:

```sh
npm run test:integration
```

The first run downloads VS Code (about 150 MB) into `vscode/.vscode-test/`. To test another
version, set `VSCODE_TEST_VERSION`, e.g. `VSCODE_TEST_VERSION=1.101.0` for the oldest supported
one.

### Icon

Edit `vscode/images/icon.svg`, then run `npm run icon` to write `vscode/images/icon.png`, the
file the Marketplace shows.

### Package

```sh
npx vsce package --no-dependencies
```

The extension is bundled into `dist/extension.js`, so `node_modules` isn't part of the package.
See [publishing](publishing.md) for releases.
