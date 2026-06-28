#!/usr/bin/env node

import assert from 'node:assert/strict'

import { StatusDisplay } from '../gh-pull-all.mjs'

const longError = "Error: Your configuration specifies to merge with the ref 'refs/heads/main' from the remote, but no such ref was fetched."

function captureOutput(action) {
  const chunks = []
  const originalLog = console.log
  const originalWrite = process.stdout.write

  console.log = (...args) => {
    chunks.push(`${args.join(' ')}\n`)
  }

  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(String(chunk))
    if (typeof encoding === 'function') {
      encoding()
    }
    if (typeof callback === 'function') {
      callback()
    }
    return true
  }

  try {
    action()
  } finally {
    console.log = originalLog
    process.stdout.write = originalWrite
  }

  return chunks.join('')
}

function createDisplay({ liveUpdates }) {
  const display = new StatusDisplay(liveUpdates, liveUpdates ? 2 : 1)
  display.isInteractive = false
  display.useInPlaceUpdates = liveUpdates
  display.terminalWidth = 80
  display.terminalHeight = 24
  display.addRepo('repo-with-long-error')
  return display
}

function assertConciseErrorStatus(output) {
  assert.match(output, /Error #1/)
  assert.doesNotMatch(output, /Your configuration specifies/)
  assert.doesNotMatch(output, /from the remote, but no such ref was fetched/)
  assert.doesNotMatch(output, /\.\.\./)
}

const appendOnlyOutput = captureOutput(() => {
  createDisplay({ liveUpdates: false }).updateRepo('repo-with-long-error', 'failed', longError)
})
assertConciseErrorStatus(appendOnlyOutput)

const liveRenderOutput = captureOutput(() => {
  const display = createDisplay({ liveUpdates: true })
  display.updateRepo('repo-with-long-error', 'failed', longError)
  display.render()
})
assertConciseErrorStatus(liveRenderOutput)

console.log('StatusDisplay concise error status tests passed')
