# Agent eval examples: Claude Code + Codex

Add a real agent eval (`http-server`) that tests both Claude Code and Codex on the same task with separate containers.

## Goal

Create an eval where both agents solve the same coding task — "create an HTTP server that responds with JSON" — each in its own isolated container. Validates the harness works with real agent CLIs.

## Changes

### New eval: `evals/http-server/`

Two files:

- `eval.test.ts` — host-side orchestrator with two `test()` cases (one per agent)
- `verify.test.ts` — shared verification, runs inside container

### Updated: `.env.example`

Add `CLAUDE_CODE_OAUTH_TOKEN` as an alternative to `ANTHROPIC_API_KEY`:

```
ANTHROPIC_API_KEY=
CLAUDE_CODE_OAUTH_TOKEN=
OPENAI_API_KEY=
```

### Updated: hello-world eval

Switch from `node:20` to `node:24`.

## Agent CLI setup

CLIs are installed at runtime inside each container (no custom Docker image):

**Claude Code:**
```bash
npm install -g @anthropic-ai/claude-code
claude -p "..." --dangerously-skip-permissions
```
- Auth: `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` (Claude Code picks whichever is set)
- `--dangerously-skip-permissions` for unattended execution

**Codex:**
```bash
npm install -g @openai/codex
codex exec "..." --full-auto
```
- Auth: `OPENAI_API_KEY`
- `--full-auto` for auto-approval with workspace-write sandbox

## eval.test.ts

Two independent tests, each with its own container:

```ts
import { test, expect } from 'vitest'
import { createEvalContainer, type EvalContainer } from '../../helpers/docker'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prompt = 'create an HTTP server on port 3000 that responds with {"hello":"world"} on GET /'

async function runVerify(container: EvalContainer): Promise<void> {
  await container.exec('npm install -g vitest')
  await container.copyFileIn(
    resolve(__dirname, 'verify.test.ts'),
    '/app/verify.test.ts',
  )
  const result = await container.exec('vitest run /app/verify.test.ts')
  expect(result.exitCode).toBe(0)
}

test('claude-code: creates HTTP server', async () => {
  const container = await createEvalContainer({
    image: 'node:24',
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
    },
  })

  try {
    await container.exec('npm install -g @anthropic-ai/claude-code')
    await container.exec(`claude -p "${prompt}" --dangerously-skip-permissions`)
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
    await container.exec('npm install -g @openai/codex')
    await container.exec(`codex exec "${prompt}" --full-auto`)
    await runVerify(container)
  } finally {
    await container.cleanup()
  }
})
```

## verify.test.ts

Runs inside container. Finds the entry file, starts the server, checks the JSON response:

```ts
import { test, expect } from 'vitest'
import { execSync, spawn } from 'child_process'

test('server responds with { hello: world }', async () => {
  // Find entry file
  const files = execSync('ls /app/*.js 2>/dev/null || ls /app/*.mjs 2>/dev/null || ls /app/*.ts 2>/dev/null')
    .toString().trim().split('\n')
  const entry = files.find(f => /index|server|app/.test(f)) ?? files[0]

  // Start server in background
  const server = spawn('node', [entry], { cwd: '/app', detached: true, stdio: 'ignore' })

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 2000))

  try {
    // Check response
    const res = execSync('curl -s http://localhost:3000').toString()
    expect(JSON.parse(res)).toEqual({ hello: 'world' })
  } finally {
    // Cleanup server process
    process.kill(-server.pid!)
  }
})
```

## Docker image

Uses `node:24` (pre-existing, no custom build). Agent CLIs installed at runtime via `npm install -g`.

## Test timeout

Each test may take 1-3 minutes (container boot + CLI install + agent execution + verify). Bump `testTimeout` in vitest.config.ts from `120_000` to `300_000` for real agent tests.
