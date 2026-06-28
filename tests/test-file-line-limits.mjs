#!/usr/bin/env node

import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const scriptPath = path.join(rootDir, 'scripts', 'check-file-line-limits.sh')

function lines(count) {
  return `${Array.from({ length: count }, (_, index) => `line-${index + 1}`).join('\n')}\n`
}

function createFixture(files) {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'gh-pull-all-line-limit-'))

  for (const [filePath, lineCount] of Object.entries(files)) {
    const absolutePath = path.join(fixtureDir, filePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, lines(lineCount))
  }

  return fixtureDir
}

function runLineLimitCheck(fixtureDir, env = process.env) {
  return spawnSync('bash', [scriptPath], {
    cwd: fixtureDir,
    encoding: 'utf8',
    env,
  })
}

function withFixture(files, callback) {
  const fixtureDir = createFixture(files)
  try {
    callback(fixtureDir)
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
}

withFixture({
  'src/near-limit.mjs': 1351,
  '.github/workflows/release.yml': 1351,
}, (fixtureDir) => {
  const result = runLineLimitCheck(fixtureDir)

  assert.equal(result.status, 0)
  assert.match(result.stdout, /WARNING: \.\/src\/near-limit\.mjs has 1351 lines/)
  assert.match(result.stdout, /WARNING: \.github\/workflows\/release\.yml has 1351 lines/)
  assert.match(result.stdout, /::warning file=\.\/src\/near-limit\.mjs::/)
  assert.match(result.stdout, /approaching the 1500 line limit \(>1350 lines\)/)
  assert.doesNotMatch(result.stdout, /The following files exceed the 1500 line limit:/)
})

withFixture({
  'src/too-large.js': 1501,
  'docs/too-large.md': 1502,
  '.github/workflows/release.yml': 1503,
}, (fixtureDir) => {
  const result = runLineLimitCheck(fixtureDir)

  assert.equal(result.status, 1)
  assert.match(result.stdout, /ERROR: \.\/src\/too-large\.js has 1501 lines \(limit: 1500\)/)
  assert.match(result.stdout, /ERROR: \.\/docs\/too-large\.md has 1502 lines \(limit: 1500\)/)
  assert.match(result.stdout, /ERROR: \.github\/workflows\/release\.yml has 1503 lines \(limit: 1500\)/)
  assert.match(result.stdout, /::error file=\.\/src\/too-large\.js::/)
  assert.match(result.stdout, /The following files exceed the 1500 line limit:/)
})

withFixture({
  'src/near-limit.cjs': 1351,
}, (fixtureDir) => {
  const binDir = path.join(fixtureDir, 'bin')
  const fakeWcPath = path.join(binDir, 'wc')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(
    fakeWcPath,
    `#!/bin/sh
awk 'END { printf "    %d\\n", NR }'
`
  )
  chmodSync(fakeWcPath, 0o755)

  const result = runLineLimitCheck(fixtureDir, {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /WARNING: \.\/src\/near-limit\.cjs has 1351 lines/)
  assert.doesNotMatch(result.stdout, /has     1351 lines/)
})

console.log('File line limit checks passed')
