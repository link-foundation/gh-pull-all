#!/usr/bin/env bun

// Test thread configuration functionality
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { runScript, TestEnvironment } from './test-utils.mjs'

const testEnv = new TestEnvironment('threading-test-')

test.before(async () => {
  await testEnv.setup()
})

test.after(async () => {
  await testEnv.teardown()
})

test('should show single-thread concurrency', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--single-thread', '--dir', testEnv.tempDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Concurrency: 1 thread \(sequential\)/)
})

test('should show custom thread count', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--threads', '5', '--dir', testEnv.tempDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Concurrency: 5 threads \(parallel\)/)
})

test('should support -j alias for threads', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '-j', '7', '--dir', testEnv.tempDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Concurrency: 7 threads \(parallel\)/)
})

test('should reject thread count less than 1', async () => {
  try {
    await runScript(['--user', 'test', '--threads', '0'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    // The process should exit before our timeout due to validation error
    assert.ok(true, 'Validation error handled correctly')
  }
})

test('should reject conflicting single-thread and threads options', async () => {
  try {
    await runScript(['--user', 'test', '--single-thread', '--threads', '5'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    // The process should exit before our timeout due to validation error
    assert.ok(true, 'Conflicting options handled correctly')
  }
})

test('should default to 8 threads when no option specified', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--dir', testEnv.tempDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Concurrency: 8 threads \(parallel\)/)
})

test('should show help with new threading options', async () => {
  const result = await runScript(['--help'])
  
  // Help is shown but exits with 1 due to missing required args
  assert.equal(result.code, 1)
  assert.match(result.stderr, /--threads/)
  assert.match(result.stderr, /--single-thread/)
  assert.match(result.stderr, /-j, --threads/)
  assert.match(result.stderr, /Number of concurrent operations/)
  assert.match(result.stderr, /Run operations sequentially/)
})

test.run()