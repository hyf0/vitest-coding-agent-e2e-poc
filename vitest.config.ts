import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['evals/**/eval.test.ts'],
    exclude: ['evals/**/verify.test.ts'],
    testTimeout: 300_000,
    env: loadEnv(mode, process.cwd(), ''),
  },
}))
