# vitest-coding-agent-e2e-poc

Minimal POC for e2e testing of coding agents (Claude Code, Codex) using Vitest + Docker.

## Docker Container Notes

- Containers run as **root** by default. This is intentional — Docker is the sandbox.
- The `node:24` image installs Node.js system-wide in `/usr/local/`, so `npm install -g` requires root. This is different from local dev where nvm installs to `~/.nvm/` as your user.

## Claude Code in Docker

- `--dangerously-skip-permissions` is **blocked when running as root** — Claude Code hardcodes this check and Anthropic has no plans to change it (https://github.com/anthropics/claude-code/issues/3490).
- **Workaround:** Set `IS_SANDBOX=1` env var to bypass the root check (https://github.com/anthropics/claude-code/issues/9184).
- Auth: pass `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` as env var to the container.
- `claude setup-token` **generates** a token (opens OAuth in browser), it does not consume one. The resulting token is set via `CLAUDE_CODE_OAUTH_TOKEN`.
- Model names support `[1m]` suffix for 1M context: `claude-opus-4-6[1m]`, `claude-sonnet-4-6[1m]`.

## Codex Auth

- `CODEX_API_KEY`: API key for `codex exec`. Pay-per-use. Preferred for CI/Docker.
- `OPENAI_API_KEY`: Also works.
- ChatGPT OAuth: browser-based, for subscription users. Not exportable for CI.
- Device Code Auth (beta): `codex login --device-auth` for headless environments. Requires workspace admin to enable.

## Codex in Docker

- Requires a git repo in the working directory — `git init` runs during container setup.
- Auth: pass `OPENAI_API_KEY` as env var.
- Reasoning effort is set via config: `-c model_reasoning_effort=xhigh` (not a dedicated flag).
- `xhigh` reasoning effort is model-dependent — may not work with all models.

## Project Structure

- `helpers/docker.ts` — `EvalContainer` with `run()` (throws on non-zero exit with stdout/stderr), `copyFileIn()`, `cleanup()`
- `helpers/agents.ts` — `ClaudeCommand` and `CodexCommand` classes with `fromPreset()` and explicit constructor
- `evals/*/eval.test.ts` — host-side orchestrator (runs on your machine)
- `evals/*/verify.test.ts` — container-side assertions (copied in after agent runs, agent never sees it)
- TypeScript uses project references (`tsconfig.node.json` / `tsconfig.verify.json`) to isolate host and container type environments

## Testing Conventions

- Always use `test.concurrent()` or `describe.concurrent()` — each test gets its own Docker container so there's no reason to run sequentially.
- `.env` is loaded via Vite's `loadEnv` in `vitest.config.ts` — no need for dotenv.

## Eval Env Vars

- `EVAL_RUNS` — number of times to run each eval. Default: `3`.
- `MAX_CONTAINERS` — max concurrent Docker containers. Default: `5`.
- `UPDATE_EVAL=1` — force re-run, delete existing results.

## Running

```bash
# All evals
npx vitest run

# Specific eval
npx vitest run evals/hello-world/eval.test.ts

# Specific agent test
npx vitest run -t "claude-code"
```
