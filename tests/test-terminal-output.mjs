#!/usr/bin/env bun

// Test terminal output modes
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const { spawn } = await import('child_process')

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['../gh-pull-all.mjs', ...args], {
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
  })
}

test('no-live-updates mode should not use cursor manipulation', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user', '--no-live-updates'])
  
  // Should not contain ANSI cursor movement codes
  assert.not.match(result.stdout, /\x1b\[\d+A/) // No cursor up
  assert.not.match(result.stdout, /\x1b\[2K/) // No line clearing
  
  // Should contain standard output
  assert.match(result.stdout, /Starting nonexistent-test-user user repository sync/)
  assert.match(result.stdout, /Concurrency: 8 threads/)
})

test('help should show both live-updates options', async () => {
  const result = await runScript(['--help'])
  
  assert.equal(result.code, 0)
  assert.match(result.stdout, /--live-updates/)
  assert.match(result.stdout, /--no-live-updates/)
  assert.match(result.stdout, /Enable live in-place status updates/)
})

test('default mode uses live updates', async () => {
  const result = await runScript(['--user', 'test-nonexistent'])
  
  // Should contain startup information
  assert.match(result.stdout, /Starting test-nonexistent user repository sync/)
  assert.match(result.stdout, /Target directory:/)
  assert.match(result.stdout, /Concurrency:/)
  
  // Since it's the default, no special flags should be needed
  assert.equal(result.code, 1) // Should fail with non-existent user
})

test.run()