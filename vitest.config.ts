import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/backend/test/**/*.test.ts', 'apps/window/src/utils/**/*.test.ts'],
    coverage: {
      enabled: false,
    },
  },
});
