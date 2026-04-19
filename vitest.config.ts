import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    test: {
      include: ['evals/**/eval.test.ts'],
      exclude: ['evals/**/verify.test.ts'],
      testTimeout: 300_000,
    },
  }
})
