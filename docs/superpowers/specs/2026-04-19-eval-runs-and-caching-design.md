# Eval runs and result caching

Add repeated runs for stability testing, result storage, and smart skipping.

## Goal

Run each eval multiple times to test agent stability. Store results to disk. Skip evals that already have results unless forced to re-run.

## Env vars

- `EVAL_RUNS` — number of runs per test. Default: `3`.
- `MAX_CONTAINERS` — max concurrent Docker containers. Default: `5`.
- `UPDATE_EVAL=1` — force re-run, delete existing results before running.

## Result storage

Each eval directory gets a `results.json` (gitignored):

```
evals/http-server/
  eval.test.ts
  verify.test.ts
  results.json        # generated
```

Format — keyed by model name:

```json
{
  "claude-opus-4-6[1m]": {
    "runs": [
      { "status": "pass", "duration": 34865, "timestamp": "2026-04-19T05:20:00Z" },
      { "status": "fail", "duration": 12340, "timestamp": "2026-04-19T05:21:00Z", "error": "timeout" }
    ]
  }
}
```

- `status`: `"pass"` or `"fail"`
- `duration`: milliseconds
- `timestamp`: ISO 8601
- `error`: only present on failure, short description

## Skip logic

Before running, check if `results.json` has an entry for the model key:
- If entry exists and `UPDATE_EVAL` is not set → skip the test
- If `UPDATE_EVAL=1` → delete `results.json` and re-run

## Concurrent runs within a test

Runs execute in parallel via `Promise.all`. Each run creates its own container:

```ts
const claude = ClaudeCommand.fromPreset('opus4.6[1m]-max')

test.concurrent('claude-code: creates HTTP server', async () => {
  if (shouldSkip(__dirname, claude.model)) return

  const runs = Number(process.env.EVAL_RUNS ?? 3)

  await Promise.all(
    Array.from({ length: runs }, () =>
      runOneAttempt()  // creates container, runs agent, records result
    )
  )
})
```

## Container semaphore

`createEvalContainer` enforces a global limit on concurrent containers via a semaphore in `helpers/docker.ts`. If `MAX_CONTAINERS` containers are running, it waits until one finishes.

## New file: `helpers/results.ts`

```ts
function loadResults(evalDir: string): Record<string, EvalResult>
function saveRunResult(evalDir: string, key: string, run: RunResult): void
function shouldSkip(evalDir: string, key: string): boolean
function clearResults(evalDir: string): void
```

- `loadResults` — reads `results.json`, returns empty object if not found
- `saveRunResult` — appends a run to the key's runs array, writes atomically
- `shouldSkip` — returns `true` if key has results and `UPDATE_EVAL` is not set
- `clearResults` — deletes `results.json`

## Changes to existing files

- `helpers/docker.ts` — add semaphore to `createEvalContainer`
- `.gitignore` — add `results.json`
- `CLAUDE.md` — document `EVAL_RUNS`, `MAX_CONTAINERS`, `UPDATE_EVAL` env vars
- `evals/http-server/eval.test.ts` — use `shouldSkip`, `EVAL_RUNS`, record results
