# Agent Eval Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `http-server` eval that tests both Claude Code and Codex on the same coding task, each in its own isolated Docker container.

**Architecture:** Two new files (`eval.test.ts` + `verify.test.ts`) under `evals/http-server/`. Minor updates to `.env.example`, `vitest.config.ts`, and the existing hello-world eval image. The eval.test.ts has two `test()` cases sharing a `runVerify` helper. The verify.test.ts finds the agent's output file, starts the server, and checks the JSON response.

**Tech Stack:** TypeScript, Vitest, dockerode, Docker (node:24 image)

---

## File Structure

```
Modified:
  .env.example                          # add CLAUDE_CODE_OAUTH_TOKEN
  vitest.config.ts                      # bump testTimeout to 300_000
  evals/hello-world/eval.test.ts        # switch node:20 → node:24

Created:
  evals/http-server/eval.test.ts        # host orchestrator, two test() cases
  evals/http-server/verify.test.ts      # container-side, start server + check JSON
```

---

### Task 1: Update config and existing eval

**Files:**
- Modify: `.env.example`
- Modify: `vitest.config.ts:7`
- Modify: `evals/hello-world/eval.test.ts:10`

- [ ] **Step 1: Update .env.example**

Add `CLAUDE_CODE_OAUTH_TOKEN` between the two existing lines:

```
ANTHROPIC_API_KEY=
CLAUDE_CODE_OAUTH_TOKEN=
OPENAI_API_KEY=
```

- [ ] **Step 2: Update vitest.config.ts timeout**

Change `testTimeout: 120_000` to `testTimeout: 300_000`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['evals/**/eval.test.ts'],
    exclude: ['evals/**/verify.test.ts'],
    testTimeout: 300_000,
  },
})
```

- [ ] **Step 3: Update hello-world eval to node:24**

In `evals/hello-world/eval.test.ts`, change `image: 'node:20'` to `image: 'node:24'`:

```ts
  const container = await createEvalContainer({
    image: 'node:24',
  })
```

- [ ] **Step 4: Verify hello-world eval still works**

```bash
docker pull node:24
npx vitest run evals/hello-world/eval.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add .env.example vitest.config.ts evals/hello-world/eval.test.ts
git commit -m "chore: bump to node:24, increase timeout, add CLAUDE_CODE_OAUTH_TOKEN to env"
```

---

### Task 2: Create http-server verify test

**Files:**
- Create: `evals/http-server/verify.test.ts`

- [ ] **Step 1: Create evals/http-server/verify.test.ts**

This file runs inside the Docker container. It finds the entry file the agent created, starts the server, waits for it, and checks the JSON response.

```ts
import { test, expect } from 'vitest'
import { execSync, spawn } from 'child_process'

test('server responds with { hello: world }', async () => {
  // Find entry file — agent may name it index.js, server.js, app.js, etc.
  const files = execSync(
    'ls /app/*.js 2>/dev/null || ls /app/*.mjs 2>/dev/null || ls /app/*.ts 2>/dev/null',
  )
    .toString()
    .trim()
    .split('\n')
  const entry =
    files.find((f) => /index|server|app/.test(f)) ?? files[0]

  // Start server in background
  const server = spawn('node', [entry], {
    cwd: '/app',
    detached: true,
    stdio: 'ignore',
  })

  // Wait for server to be ready
  await new Promise((r) => setTimeout(r, 2000))

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

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 3: Verify vitest does NOT pick up verify.test.ts**

```bash
npx vitest run --reporter=verbose 2>&1 | grep http-server
```

Expected: no output (verify.test.ts is excluded by vitest config).

- [ ] **Step 4: Commit**

```bash
git add evals/http-server/verify.test.ts
git commit -m "feat: add http-server verify test"
```

---

### Task 3: Create http-server eval test

**Files:**
- Create: `evals/http-server/eval.test.ts`

- [ ] **Step 1: Create evals/http-server/eval.test.ts**

This file runs on the host. Two `test()` cases — one for Claude Code, one for Codex — each with its own container. A shared `runVerify` helper copies the verify test in and runs it.

```ts
import { test, expect } from 'vitest'
import { createEvalContainer, type EvalContainer } from '../../helpers/docker'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prompt =
  'create an HTTP server on port 3000 that responds with {"hello":"world"} on GET /'

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
    await container.exec(
      `claude -p "${prompt}" --dangerously-skip-permissions`,
    )
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

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 3: Verify vitest discovers the eval test**

```bash
npx vitest run --reporter=verbose 2>&1 | grep http-server
```

Expected: shows `evals/http-server/eval.test.ts` with the two test names.

- [ ] **Step 4: Commit**

```bash
git add evals/http-server/eval.test.ts
git commit -m "feat: add http-server eval for Claude Code and Codex"
```

---

### Task 4: Pull node:24 and validate

- [ ] **Step 1: Pull node:24 image**

```bash
docker pull node:24
```

- [ ] **Step 2: Run hello-world eval to verify node:24 works**

```bash
npx vitest run evals/hello-world/eval.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Run full typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 4: Verify http-server eval is discoverable**

```bash
npx vitest run --reporter=verbose 2>&1
```

Expected: shows both `evals/hello-world/eval.test.ts` and `evals/http-server/eval.test.ts`. The hello-world test passes. The http-server tests will fail without API keys set — that's expected.

- [ ] **Step 5: Commit if any changes**

```bash
git status
# Only commit if there are changes
```
