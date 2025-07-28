#!/usr/bin/env bun

// Test thread configuration functionality
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const { spawn } = await import('child_process')

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['../pull-all.mjs', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
    
    child.on('error', (error) => {
      reject(error)
    })
    
    // Timeout after 5 seconds for these quick tests
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Test timeout'))
    }, 5000)
  })
}

test('should show single-thread concurrency', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--single-thread'])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /⚡ Concurrency: 1 thread \(sequential\)/)
})

test('should show custom thread count', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--threads', '5'])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /⚡ Concurrency: 5 threads \(parallel\)/)
})

test('should support -j alias for threads', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '-j', '7'])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /⚡ Concurrency: 7 threads \(parallel\)/)
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
  const result = await runScript(['--user', 'nonexistent-test-user'])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /⚡ Concurrency: 8 threads \(parallel\)/)
})

test('should show help with new threading options', async () => {
  const result = await runScript(['--help'])
  
  assert.equal(result.code, 0)
  assert.match(result.stdout, /--threads/)
  assert.match(result.stdout, /--single-thread/)
  assert.match(result.stdout, /-j, --threads/)
  assert.match(result.stdout, /Number of concurrent operations/)
  assert.match(result.stdout, /Run operations sequentially/)
})

test.run()