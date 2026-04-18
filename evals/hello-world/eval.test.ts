import { test, expect } from 'vitest'
import { createEvalContainer } from '../../helpers/docker'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('agent creates hello.txt with hello world', async () => {
  const container = await createEvalContainer({
    image: 'node:20',
  })

  try {
    // Simulate agent — replace with real agent command:
    // await container.exec('claude -p "create a file hello.txt containing hello world"')
    await container.exec('echo "hello world" > /app/hello.txt')

    // Install vitest in container
    await container.exec('npm install -g vitest')

    // Copy verify test into container
    await container.copyFileIn(
      resolve(__dirname, 'verify.test.ts'),
      '/app/verify.test.ts',
    )

    // Run verification
    const result = await container.exec('vitest run /app/verify.test.ts')
    expect(result.exitCode).toBe(0)
  } finally {
    await container.cleanup()
  }
})
