import { test, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'

test('hello.txt exists', () => {
  expect(existsSync('/app/hello.txt')).toBe(true)
})

test('hello.txt contains hello world', () => {
  const content = readFileSync('/app/hello.txt', 'utf-8')
  expect(content.toLowerCase()).toContain('hello world')
})
