#!/usr/bin/env bun

// Integration test for the pull-all script
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const fs = await use('fs-extra@latest')
const path = await use('path@latest')
const { spawn } = await import('child_process')

const testDir = path.join(process.cwd(), 'test-integration-temp')

test.before(async () => {
  // Ensure test directory exists
  await fs.ensureDir(testDir)
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
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Test timeout'))
    }, 10000)
  })
}

test('script should show help when no arguments provided', async () => {
  const result = await runScript([])
  
  // Script should exit with error code due to validation
  assert.not.equal(result.code, 0)
  assert.match(result.stderr, /You must specify either --org or --user/)
})

test('script should show help with --help flag', async () => {
  const result = await runScript(['--help'])
  
  assert.equal(result.code, 0)
  assert.match(result.stdout, /Usage:/)
  assert.match(result.stdout, /GitHub organization name/)
  assert.match(result.stdout, /GitHub username/)
})

test('script should handle non-existent organization gracefully', async () => {
  const result = await runScript(['--org', 'nonexistent-org-12345', '--dir', testDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Organization 'nonexistent-org-12345' not found/)
})

test('script should handle non-existent user gracefully', async () => {
  const result = await runScript(['--user', 'nonexistent-user-12345', '--dir', testDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /User 'nonexistent-user-12345' not found/)
})

test('script should start processing without crashing', async () => {
  // Simple test to ensure script doesn't crash on startup with valid args
  const result = await runScript(['--org', 'nonexistent-test-org-12345', '--dir', testDir])
  
  // Should fail gracefully, not crash
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Organization 'nonexistent-test-org-12345' not found/)
})

test('script should validate conflicting org and user arguments', async () => {
  const result = await runScript(['--org', 'test-org', '--user', 'test-user'])
  
  assert.not.equal(result.code, 0)
  assert.match(result.stderr, /You cannot specify both --org and --user/)
})

test.run()