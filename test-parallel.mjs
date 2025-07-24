#!/usr/bin/env bun

// Test parallel processing functionality
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const fs = await use('fs-extra@latest')
const path = await use('path@latest')
const { spawn } = await import('child_process')

const testDir = '/tmp/test-parallel-demo'

test.before(async () => {
  // Clean up any existing test directory
  await fs.remove(testDir)
})

test.after(async () => {
  // Clean up test directory
  await fs.remove(testDir)
})

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['./pull-all.mjs', ...args], {
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
    
    // Timeout after 15 seconds
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Test timeout'))
    }, 15000)
  })
}

test('parallel processing should handle invalid user gracefully', async () => {
  const result = await runScript(['--user', 'nonexistent-parallel-test-user', '--dir', testDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /User 'nonexistent-parallel-test-user' not found/)
})

test('parallel processing should initialize status display', async () => {
  // Test with a very simple case that will start the parallel processing
  const child = spawn('bun', ['./pull-all.mjs', '--user', 'github', '--dir', testDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  })
  
  let stdout = ''
  child.stdout.on('data', (data) => {
    stdout += data.toString()
  })
  
  // Kill after 3 seconds to avoid long download
  setTimeout(() => {
    child.kill('SIGTERM')
  }, 3000)
  
  const result = await new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stdout })
    })
  })
  
  // Should have started the parallel sync process
  assert.match(result.stdout, /Starting github user repository sync/)
  assert.match(result.stdout, /Fetching repositories/)
})

test('parallel script should show improved output format', async () => {
  // Test that the script uses the new parallel format by checking for specific output patterns
  const result = await runScript(['--user', 'nonexistent-test-user', '--dir', testDir])
  
  // Should fail gracefully with our new error handling
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Starting nonexistent-test-user user repository sync/)
})

test.run()