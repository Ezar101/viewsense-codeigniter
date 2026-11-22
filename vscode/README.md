# ViewSense for CodeIgniter - VS Code extension

Work in progress. See the [main README](../README.md).

## Development

You need Node.js 22.12 or later.

```sh
npm install
npm run check   # type check, lint, format check and tests
npm run test:watch
```

The analysis code lives in `src/core/` and doesn't depend on VS Code, so you can test it with
Vitest alone. Tests read the sample projects in [`../fixtures/`](../fixtures/).
