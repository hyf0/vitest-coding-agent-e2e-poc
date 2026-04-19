import { test } from 'vitest'
import { ClaudeCommand } from '../../helpers/agents'
import { runEval } from '../../helpers/eval'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prompt = 'create a file called hello.txt containing hello world'

const claudeEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
  // Allows --dangerously-skip-permissions to work as root in Docker
  // See: https://github.com/anthropics/claude-code/issues/9184
  IS_SANDBOX: '1',
}

const opus = ClaudeCommand.fromPreset('opus4.6[1m]-max')
const sonnet = ClaudeCommand.fromPreset('sonnet4.6[1m]-high')

test.concurrent('opus4.6[1m]: creates hello.txt', () =>
  runEval({
    evalDir: __dirname,
    key: opus.model,
    env: claudeEnv,
    setup: 'npm install -g @anthropic-ai/claude-code',
    command: opus.toString(prompt),
    verifyTest: 'verify.test.ts',
  }),
)

test.concurrent('sonnet4.6[1m]: creates hello.txt', () =>
  runEval({
    evalDir: __dirname,
    key: sonnet.model,
    env: claudeEnv,
    setup: 'npm install -g @anthropic-ai/claude-code',
    command: sonnet.toString(prompt),
    verifyTest: 'verify.test.ts',
  }),
)
