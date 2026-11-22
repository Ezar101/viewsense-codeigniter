import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests run inside VS Code with `npm run test:integration`.
    include: ['test/**/*.test.ts'],
  },
});
