# vitest-coding-agent-e2e-poc

Minimal POC for end-to-end testing of coding agents (Claude Code, Codex) using Vitest + Docker.

## How it works

```
1. Start a Docker container (as root — Docker is the sandbox)
2. Install the agent CLI
3. Run an agent command inside it
4. Copy a verify test into the container (agent never sees it)
5. Run vitest inside the container to assert the result
6. Record pass/fail to results.json
7. Clean up
```

Each eval runs N times (default 3) for stability testing. Results are cached — if results exist, the eval is skipped on the next run.

## Project structure

```
├── helpers/
│   ├── docker.ts       # createEvalContainer + container semaphore
│   ├── agents.ts       # ClaudeCommand / CodexCommand with presets
│   ├── eval.ts         # runEval — handles lifecycle, runs, results, skip
│   └── results.ts      # results.json read/write/skip/clear
├── evals/
│   └── hello-txt/
│       ├── eval.test.ts    # opus4.6[1m] + sonnet4.6[1m] tests
│       ├── verify.test.ts  # runs inside container
│       └── results.json    # generated, gitignored
├── tsconfig.json           # project references (host/container isolation)
├── tsconfig.node.json      # host environment
├── tsconfig.verify.json    # container environment (isolated)
└── vitest.config.ts
```

- **`eval.test.ts`** runs on the host — declares which agent/model to test
- **`verify.test.ts`** runs inside the container — self-contained assertions
- **`results.json`** — generated per eval, stores run history per model

## Prerequisites

- Node.js 20+
- Docker

## Setup

```bash
npm install
cp .env.example .env
# Add your API keys to .env (see .env.example for options)
```

## Usage

```bash
# Run all evals (3 runs each by default)
npx vitest run

# Single run
EVAL_RUNS=1 npx vitest run

# Force re-run (ignore cached results)
UPDATE_EVAL=1 npx vitest run

# Specific eval
npx vitest run evals/hello-txt/eval.test.ts

# Typecheck
npx tsc -b
```

## Env vars

| Variable | Default | Description |
|---|---|---|
| `EVAL_RUNS` | `3` | Number of times to run each eval |
| `MAX_CONTAINERS` | `5` | Max concurrent Docker containers |
| `UPDATE_EVAL` | - | Set to `1` to force re-run, ignoring cached results |

## Writing an eval

Create a new directory under `evals/`:

```
evals/my-eval/
├── eval.test.ts       # host orchestrator
└── verify.test.ts     # container assertions
```

**eval.test.ts**:
```ts
import { test } from 'vitest'
import { ClaudeCommand } from '../../helpers/agents'
import { runEval } from '../../helpers/eval'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const claude = ClaudeCommand.fromPreset('opus4.6[1m]-max')

test.concurrent('opus4.6[1m]: my eval', () =>
  runEval({
    evalDir: __dirname,
    key: claude.model,
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      IS_SANDBOX: '1',
    },
    setup: 'npm install -g @anthropic-ai/claude-code',
    command: claude.toString('do the thing'),
    verifyTest: 'verify.test.ts',
  }),
)
```

**verify.test.ts** (runs inside container):
```ts
import { test, expect } from 'vitest'
import { readFileSync } from 'fs'

test('output is correct', () => {
  const content = readFileSync('/app/output.txt', 'utf-8')
  expect(content).toContain('expected')
})
```

## Prior art

- [evalspace](https://github.com/serkodev/evalspace)
- [agent-eval](https://github.com/vercel-labs/agent-eval)
- [next-evals-oss](https://github.com/vercel/next-evals-oss)
