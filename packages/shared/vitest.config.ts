import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    passWithNoTests: true, // Don't fail when no test files exist (e.g., after cleanup)
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/**/*.test.ts'],
    },
  },
});
