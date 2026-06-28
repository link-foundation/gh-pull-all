#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(__dirname)
const cliPath = path.join(projectRoot, 'gh-pull-all.mjs')

function runHelp(args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' }
  })
}

function assertFullHelpOutput(args) {
  const output = runHelp(args)

  assert.match(output, /Usage:/)
  assert.match(output, /--org/)
  assert.match(output, /--user/)
  assert.match(output, /--threads/)
  assert.match(output, /--switch-to-default/)
  assert.match(output, /--pull-changes-to-fork/)
  assert.match(output, /Examples:/)
  assert.doesNotMatch(output, /You must specify either --org or --user/)
  assert.doesNotMatch(output, /Starting undefined/)
}

assertFullHelpOutput(['--help'])
assertFullHelpOutput(['-h'])
assertFullHelpOutput(['--help', 'true'])

console.log('Help CLI tests passed')
