import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname);
const repoRoot = resolve(rootDir, '..');
const sharedDir = resolve(repoRoot, 'packages', 'shared');

export default defineConfig({
  resolve: {
    alias: {
      '@root': rootDir,
      '@lib': resolve(rootDir, 'lib'),
      '@assets': resolve(rootDir, 'lib', 'assets'),
      '@chrome-extension-boilerplate/shared': sharedDir,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/**/*.test.ts'],
    },
  },
});
