import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['evals/**/eval.test.ts'],
    exclude: ['evals/**/verify.test.ts'],
    testTimeout: 300_000,
  },
})
