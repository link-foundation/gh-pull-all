#!/usr/bin/env bun

// Test terminal output modes
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { runScript, assertNoAnsiCursorCodes, TestEnvironment } from './test-utils.mjs'

const testEnv = new TestEnvironment('terminal-output-test-')

test.before(async () => {
  await testEnv.setup()
})

test.after(async () => {
  await testEnv.teardown()
})

test('no-live-updates mode should not use cursor manipulation', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--no-live-updates', '--dir', testEnv.tempDir])
  
  // Should not contain ANSI cursor movement codes
  assertNoAnsiCursorCodes(result.stdout)
  
  // Should contain standard output  
  assert.match(result.stdout, /Starting nonexistent-test-user user repository sync/)
  assert.match(result.stdout, /Concurrency: 8 threads/)
})

test('help should show both live-updates options', async () => {
  const result = await runScript(['--help'])
  
  // Help is shown but exits with 1 due to missing required args
  assert.equal(result.code, 1)
  assert.match(result.stderr, /--live-updates/)
  assert.match(result.stderr, /--no-live-updates/)
  assert.match(result.stderr, /Enable live in-place status updates/)
})

test('default mode uses live updates', async () => {
  const result = await runScript(['--user', 'test-nonexistent', '--dir', testEnv.tempDir])
  
  // Should contain startup information
  assert.match(result.stdout, /Starting test-nonexistent user repository sync/)
  assert.match(result.stdout, /Target directory:/)
  assert.match(result.stdout, /Concurrency:/)
  
  // Since it's the default, no special flags should be needed
  assert.equal(result.code, 1) // Should fail with non-existent user
})

test.run()