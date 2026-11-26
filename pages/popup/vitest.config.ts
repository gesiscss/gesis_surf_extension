import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@src': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
