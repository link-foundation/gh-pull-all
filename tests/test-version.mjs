#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(__dirname)
const cliPath = path.join(projectRoot, 'gh-pull-all.mjs')
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
const expectedVersion = packageJson.version

function runVersion(scriptPath, args) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' }
  }).trim()
}

function assertVersion(scriptPath, args) {
  const output = runVersion(scriptPath, args)
  assert.equal(output, expectedVersion)
  assert.notEqual(output, 'unknown')
}

assertVersion(cliPath, ['--version'])
assertVersion(cliPath, ['-v'])

const tempDir = mkdtempSync(path.join(tmpdir(), 'gh-pull-all-version-'))

try {
  const isolatedCliPath = path.join(tempDir, 'gh-pull-all.mjs')
  copyFileSync(cliPath, isolatedCliPath)
  assertVersion(isolatedCliPath, ['--version'])
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Version CLI tests passed')
