# vitest-coding-agent-e2e-poc

Minimal POC for end-to-end testing of coding agents (Claude Code, Codex, etc.) using Vitest + Docker.

## How it works

```
1. Start a Docker container
2. Run an agent command inside it (any CLI)
3. Copy a verify test into the container (agent never sees it)
4. Run vitest inside the container to assert the result
5. Clean up
```

Each eval is a single Vitest test file on the host that orchestrates the full flow via [dockerode](https://github.com/apocas/dockerode).

## Project structure

```
├── helpers/
│   └── docker.ts              # thin dockerode wrapper (exec, copyFileIn, cleanup)
├── evals/
│   └── hello-world/
│       ├── eval.test.ts       # host-side orchestrator
│       └── verify.test.ts     # runs inside container
├── tsconfig.json              # project references (host/container isolation)
├── tsconfig.node.json         # host environment
├── tsconfig.verify.json       # container environment (isolated)
└── vitest.config.ts           # includes eval.test.ts, excludes verify.test.ts
```

- **`eval.test.ts`** runs on the host — creates a container, runs the agent, copies the verify test in, runs it
- **`verify.test.ts`** runs inside the container — self-contained, imports only `vitest` and Node.js builtins

TypeScript configs use [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) to keep host and container type environments fully isolated.

## Prerequisites

- Node.js 20+
- Docker

## Setup

```bash
npm install
cp .env.example .env
# Add your API keys to .env
```

## Usage

```bash
# Run all evals
npx vitest run

# Watch mode
npx vitest

# Typecheck
npx tsc -b
```

## Writing an eval

Create a new directory under `evals/`:

```
evals/my-eval/
├── eval.test.ts       # host orchestrator
└── verify.test.ts     # container assertions
```

**eval.test.ts** (host):
```ts
import { test, expect } from 'vitest'
import { createEvalContainer } from '../../helpers/docker'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('agent does the thing', async () => {
  const container = await createEvalContainer({
    image: 'node:20',
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
  })

  try {
    await container.exec('claude -p "do the thing"')
    await container.exec('npm install -g vitest')
    await container.copyFileIn(
      resolve(__dirname, 'verify.test.ts'),
      '/app/verify.test.ts',
    )
    const result = await container.exec('vitest run /app/verify.test.ts')
    expect(result.exitCode).toBe(0)
  } finally {
    await container.cleanup()
  }
})
```

**verify.test.ts** (container):
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
