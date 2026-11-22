// Bundles the extension and its dependencies into one file: dist/extension.js.
// Usage: node esbuild.mjs [--production] [--watch]
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  // VS Code 1.95 runs extensions on Node.js 20.
  target: 'node20',
  outfile: 'dist/extension.js',
  // Provided by VS Code at runtime, never bundled.
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
