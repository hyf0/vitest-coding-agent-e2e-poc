import { test } from 'vitest'
import { createEvalContainer, type EvalContainer } from '../../helpers/docker'
import { ClaudeCommand, CodexCommand } from '../../helpers/agents'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prompt =
  'create an HTTP server on port 3000 that responds with {"hello":"world"} on GET /'

const claude = new ClaudeCommand()
const codex = new CodexCommand()

async function runVerify(container: EvalContainer): Promise<void> {
  await container.run('npm install -g vitest')
  await container.copyFileIn(
    resolve(__dirname, 'verify.test.ts'),
    '/app/verify.test.ts',
  )
  await container.run('vitest run /app/verify.test.ts')
}

test('claude-code: creates HTTP server', async () => {
  const container = await createEvalContainer({
    image: 'node:24',
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      // Allows --dangerously-skip-permissions to work as root in Docker
      // See: https://github.com/anthropics/claude-code/issues/9184
      IS_SANDBOX: '1',
    },
  })

  try {
    await container.run('npm install -g @anthropic-ai/claude-code')
    await container.run(claude.toString(prompt))
    await runVerify(container)
  } finally {
    await container.cleanup()
  }
})

test('codex: creates HTTP server', async () => {
  const container = await createEvalContainer({
    image: 'node:24',
    env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '' },
  })

  try {
    await container.run('npm install -g @openai/codex')
    await container.run(codex.toString(prompt))
    await runVerify(container)
  } finally {
    await container.cleanup()
  }
})
