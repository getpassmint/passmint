import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The workers pool runs these under a separate vitest config —
    // exclude them here so we don't try to execute the workerd-only
    // smoke tests under Node.
    exclude: ['**/node_modules/**', 'dist/**', 'test/workers/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
})
