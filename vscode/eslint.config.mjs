// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'out/', 'dist/', 'coverage/', '.vscode-test/'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs', 'vitest.config.mts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Build scripts: plain JavaScript run by Node.js.
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  // Must stay last: turns off the rules that Prettier already handles.
  prettier,
);
