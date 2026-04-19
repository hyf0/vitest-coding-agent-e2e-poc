# Eval Runs and Result Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeated runs for stability testing, result storage to disk, smart skipping of already-run evals, and a container concurrency semaphore.

**Architecture:** A `helpers/results.ts` module handles reading/writing `results.json` per eval directory. A semaphore in `helpers/docker.ts` limits concurrent containers. Eval tests use `Promise.all` for parallel runs within a test, check `shouldSkip` before running, and record each run result.

**Tech Stack:** TypeScript, Vitest, Node.js fs, dockerode

---

## File Structure

```
Modified:
  helpers/docker.ts              # add container semaphore
  helpers/agents.ts              # expose model as public readonly
  evals/http-server/eval.test.ts # use runs, skip logic, record results
  .gitignore                     # add results.json
  CLAUDE.md                      # document new env vars

Created:
  helpers/results.ts             # loadResults, saveRunResult, shouldSkip, clearResults
```

---

### Task 1: Create helpers/results.ts

**Files:**
- Create: `helpers/results.ts`

- [ ] **Step 1: Create helpers/results.ts**

```ts
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

interface RunResult {
  status: 'pass' | 'fail'
  duration: number
  timestamp: string
  error?: string
}

interface EvalResult {
  runs: RunResult[]
}

type ResultsFile = Record<string, EvalResult>

const RESULTS_FILE = 'results.json'

function resultsPath(evalDir: string): string {
  return join(evalDir, RESULTS_FILE)
}

export function loadResults(evalDir: string): ResultsFile {
  const path = resultsPath(evalDir)
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function saveRunResult(
  evalDir: string,
  key: string,
  run: RunResult,
): void {
  const results = loadResults(evalDir)
  if (!results[key]) {
    results[key] = { runs: [] }
  }
  results[key].runs.push(run)
  writeFileSync(resultsPath(evalDir), JSON.stringify(results, null, 2) + '\n')
}

export function shouldSkip(evalDir: string, key: string): boolean {
  if (process.env.UPDATE_EVAL === '1') return false
  const results = loadResults(evalDir)
  return key in results
}

export function clearResults(evalDir: string): void {
  const path = resultsPath(evalDir)
  if (existsSync(path)) unlinkSync(path)
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add helpers/results.ts
git commit -m "feat: add helpers/results.ts for eval result storage and skip logic"
```

---

### Task 2: Add container semaphore to helpers/docker.ts

**Files:**
- Modify: `helpers/docker.ts:1-3` (add semaphore), `helpers/docker.ts:17-35` (wrap createEvalContainer)

- [ ] **Step 1: Add semaphore at the top of helpers/docker.ts**

Add after `const docker = new Docker()` (line 3):

```ts
const MAX_CONTAINERS = Number(process.env.MAX_CONTAINERS ?? 5)
let activeContainers = 0
const waitQueue: (() => void)[] = []

async function acquireSlot(): Promise<void> {
  if (activeContainers < MAX_CONTAINERS) {
    activeContainers++
    return
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve))
  activeContainers++
}

function releaseSlot(): void {
  activeContainers--
  const next = waitQueue.shift()
  if (next) next()
}
```

- [ ] **Step 2: Wrap createEvalContainer with semaphore**

Add `await acquireSlot()` at the start of `createEvalContainer` (after line 26, before `const container = await docker.createContainer`).

Add `releaseSlot()` inside the `cleanup` method, before `await container.remove`:

```ts
    async cleanup(): Promise<void> {
      try {
        await container.stop({ t: 0 })
      } catch {
        // container may already be stopped
      }
      await container.remove({ force: true })
      releaseSlot()
    },
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 4: Run hello-world eval to verify semaphore doesn't break anything**

```bash
npx vitest run evals/hello-world/eval.test.ts
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add helpers/docker.ts
git commit -m "feat: add container semaphore with MAX_CONTAINERS limit"
```

---

### Task 3: Expose model as public readonly on command classes

**Files:**
- Modify: `helpers/agents.ts:30,33` (ClaudeCommand), `helpers/agents.ts:48,51` (CodexCommand)

- [ ] **Step 1: Make model public readonly on ClaudeCommand**

Change line 30 from `private model: ClaudeModel` to `readonly model: ClaudeModel`, and line 31 from `private effort: ClaudeEffort` to `private readonly effort: ClaudeEffort`:

```ts
export class ClaudeCommand {
  readonly model: ClaudeModel
  private readonly effort: ClaudeEffort
```

- [ ] **Step 2: Make model public readonly on CodexCommand**

Change line 48 from `private model: CodexModel` to `readonly model: CodexModel`, and line 49 from `private reasoningEffort: CodexReasoningEffort` to `private readonly reasoningEffort: CodexReasoningEffort`:

```ts
export class CodexCommand {
  readonly model: CodexModel
  private readonly reasoningEffort: CodexReasoningEffort
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add helpers/agents.ts
git commit -m "refactor: expose model as public readonly on command classes"
```

---

### Task 4: Update http-server eval with runs, skip, and result recording

**Files:**
- Modify: `evals/http-server/eval.test.ts`

- [ ] **Step 1: Rewrite evals/http-server/eval.test.ts**

```ts
import { test } from 'vitest'
import { createEvalContainer, type EvalContainer } from '../../helpers/docker'
import { ClaudeCommand } from '../../helpers/agents'
import { shouldSkip, saveRunResult, clearResults } from '../../helpers/results'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prompt =
  'create an HTTP server on port 3000 that responds with {"hello":"world"} on GET /'

const claude = ClaudeCommand.fromPreset('opus4.6[1m]-max')
const runs = Number(process.env.EVAL_RUNS ?? 3)

if (process.env.UPDATE_EVAL === '1') {
  clearResults(__dirname)
}

async function runVerify(container: EvalContainer): Promise<void> {
  await container.run('npm install -g vitest')
  await container.copyFileIn(
    resolve(__dirname, 'verify.test.ts'),
    '/app/verify.test.ts',
  )
  await container.run('vitest run /app/verify.test.ts')
}

test.concurrent('claude-code: creates HTTP server', async () => {
  if (shouldSkip(__dirname, claude.model)) return

  await Promise.all(
    Array.from({ length: runs }, async () => {
      const start = Date.now()
      try {
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
          saveRunResult(__dirname, claude.model, {
            status: 'pass',
            duration: Date.now() - start,
            timestamp: new Date().toISOString(),
          })
        } finally {
          await container.cleanup()
        }
      } catch (err) {
        saveRunResult(__dirname, claude.model, {
          status: 'fail',
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
})
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add evals/http-server/eval.test.ts
git commit -m "feat: add repeated runs, result recording, and skip logic to http-server eval"
```

---

### Task 5: Update .gitignore and CLAUDE.md

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add results.json to .gitignore**

Append to `.gitignore`:

```
results.json
```

- [ ] **Step 2: Add env vars section to CLAUDE.md**

Add after the "Testing Conventions" section:

```markdown
## Eval Env Vars

- `EVAL_RUNS` — number of times to run each eval. Default: `3`.
- `MAX_CONTAINERS` — max concurrent Docker containers. Default: `5`.
- `UPDATE_EVAL=1` — force re-run, delete existing results.
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "chore: gitignore results.json, document eval env vars"
```

---

### Task 6: Validate

- [ ] **Step 1: Run typecheck**

```bash
npx tsc -b
```

Expected: exits 0.

- [ ] **Step 2: Run hello-world (should still pass, unaffected)**

```bash
npx vitest run evals/hello-world/eval.test.ts
```

Expected: passes.

- [ ] **Step 3: Run http-server eval**

```bash
npx vitest run evals/http-server/eval.test.ts
```

Expected: runs 3 times (default EVAL_RUNS), creates `evals/http-server/results.json`.

- [ ] **Step 4: Verify results.json was created**

```bash
cat evals/http-server/results.json
```

Expected: JSON with `claude-opus-4-6[1m]` key containing 3 run entries.

- [ ] **Step 5: Run again — should skip**

```bash
npx vitest run evals/http-server/eval.test.ts
```

Expected: test skips (results already exist), completes in <1 second.

- [ ] **Step 6: Force re-run with UPDATE_EVAL**

```bash
UPDATE_EVAL=1 npx vitest run evals/http-server/eval.test.ts
```

Expected: deletes results.json, runs 3 times again, creates new results.json.

- [ ] **Step 7: Test with custom EVAL_RUNS**

```bash
UPDATE_EVAL=1 EVAL_RUNS=1 npx vitest run evals/http-server/eval.test.ts
```

Expected: runs once, results.json has 1 run entry.
