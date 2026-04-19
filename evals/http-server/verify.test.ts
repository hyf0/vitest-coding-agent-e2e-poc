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
    try {
      process.kill(-server.pid!)
    } catch {
      // Process may have already exited
    }
  }
})
