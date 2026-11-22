// Settings of `vscode-test` (npm run test:integration): one run per fixture project.
// VS Code is downloaded into .vscode-test/ the first time.
import { defineConfig } from '@vscode/test-cli';

// The CI also runs the tests on the oldest VS Code version the extension supports.
const version = process.env.VSCODE_TEST_VERSION ?? 'stable';

export default defineConfig(
  ['ci3', 'ci4'].map((project) => ({
    label: project,
    files: `out/integration/${project}/**/*.test.js`,
    version,
    workspaceFolder: `.test-workspace/${project}`,
    // Other installed extensions could change the results: run with ViewSense only.
    launchArgs: ['--disable-extensions'],
    mocha: { ui: 'tdd', timeout: 20000 },
  })),
);
