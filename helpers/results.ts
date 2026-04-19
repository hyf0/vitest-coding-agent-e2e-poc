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
