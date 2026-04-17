import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/**/*.test.ts'],
    },
  },
});
