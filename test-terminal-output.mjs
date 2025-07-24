#!/usr/bin/env bun

// Test terminal output modes
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const { spawn } = await import('child_process')

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
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Test timeout'))
    }, 10000)
  })
}

test('default mode should not use cursor manipulation', async () => {
  const result = await runScript(['--user', 'nonexistent-test-user'])
  
  // Should not contain ANSI cursor movement codes
  assert.not.match(result.stdout, /\x1b\[\d+A/) // No cursor up
  assert.not.match(result.stdout, /\x1b\[2K/) // No line clearing
  
  // Should contain standard output
  assert.match(result.stdout, /Starting nonexistent-test-user user repository sync/)
  assert.match(result.stdout, /Concurrency: 8 threads/)
})

test('live-updates mode should show help option', async () => {
  const result = await runScript(['--help'])
  
  assert.equal(result.code, 0)
  assert.match(result.stdout, /--live-updates/)
  assert.match(result.stdout, /Enable live in-place status updates/)
})

test('default mode should preserve terminal history', async () => {
  const result = await runScript(['--user', 'test-nonexistent'])
  
  // All output should be on separate lines without overwriting
  const lines = result.stdout.split('\n').filter(line => line.trim())
  
  // Should have multiple distinct lines
  assert.ok(lines.length >= 4, 'Should have multiple output lines')
  
  // Should contain startup information
  assert.match(result.stdout, /Starting test-nonexistent user repository sync/)
  assert.match(result.stdout, /Target directory:/)
  assert.match(result.stdout, /Concurrency:/)
})

test.run()