// Bundles each integration test (integration/**/*.test.ts) into out/integration/, where
// `vscode-test` runs them inside VS Code.
import { readdir } from 'node:fs/promises';
import { sep } from 'node:path';
import * as esbuild from 'esbuild';

const files = (await readdir('integration', { recursive: true }))
  .map((file) => file.split(sep).join('/'))
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => `integration/${file}`);

await esbuild.build({
  entryPoints: files,
  outbase: 'integration',
  outdir: 'out/integration',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
});
console.log(`Built ${String(files.length)} integration test files`);
