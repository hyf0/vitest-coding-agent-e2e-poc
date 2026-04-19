import { createEvalContainer } from './docker'
import { shouldSkip, saveRunResult, clearResults } from './results'
import { resolve } from 'path'

interface RunEvalOptions {
  evalDir: string
  key: string
  image?: string
  env?: Record<string, string>
  setup?: string
  command: string
  verifyTest: string
}

const runs = Number(process.env.EVAL_RUNS ?? 3)

export async function runEval(options: RunEvalOptions): Promise<void> {
  if (process.env.UPDATE_EVAL === '1') {
    clearResults(options.evalDir)
  }

  if (shouldSkip(options.evalDir, options.key)) return

  await Promise.all(
    Array.from({ length: runs }, async () => {
      const start = Date.now()
      try {
        const container = await createEvalContainer({
          image: options.image ?? 'node:24',
          env: options.env,
        })

        try {
          if (options.setup) {
            await container.run(options.setup)
          }
          await container.run(options.command)
          await container.run('npm install -g vitest')
          await container.copyFileIn(
            resolve(options.evalDir, options.verifyTest),
            '/app/verify.test.ts',
          )
          await container.run('vitest run /app/verify.test.ts')
          saveRunResult(options.evalDir, options.key, {
            status: 'pass',
            duration: Date.now() - start,
            timestamp: new Date().toISOString(),
          })
        } finally {
          await container.cleanup()
        }
      } catch (err) {
        saveRunResult(options.evalDir, options.key, {
          status: 'fail',
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
}
