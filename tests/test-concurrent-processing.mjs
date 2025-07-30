#!/usr/bin/env bun

// Test concurrent repository processing with worker pool pattern
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
const { spawn } = await import('child_process')

// Use OS temporary directory
const testDir = path.join(os.tmpdir(), 'test-concurrent-processing')

test.before(async () => {
  // Clean up any existing test directory
  await fs.rm(testDir, {recursive: true, force: true})
  await fs.mkdir(testDir, { recursive: true })
})

test.after(async () => {
  // Clean up test directory
  await fs.rm(testDir, {recursive: true, force: true})
})

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['../pull-all.mjs', ...args], {
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
    
    // No timeout - let tests run to completion
  })
}

test('concurrent processing should handle multiple threads gracefully', async () => {
  // Test concurrent processing behavior with different thread counts
  const result = await runScript(['--user', 'nonexistent-test-concurrent-user', '--dir', testDir, '--threads', '4'])
  
  // Should fail gracefully with API error
  assert.equal(result.code, 1)
  
  // Should show correct concurrency setting
  assert.match(result.stdout, /Concurrency: 4 threads \(parallel\)/)
  
  // Should show proper error handling
  assert.match(result.stdout, /User 'nonexistent-test-concurrent-user' not found/)
})

test('concurrent processing with valid user should initialize properly', async () => {
  // Test with 'github' user which exists and should start processing before timing out
  const child = spawn('bun', ['../pull-all.mjs', '--user', 'github', '--dir', testDir, '--threads', '3'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  })
  
  let stdout = ''
  child.stdout.on('data', (data) => {
    stdout += data.toString()
  })
  
  // Let it run for a bit then kill to test initialization
  await new Promise(resolve => setTimeout(resolve, 3000))
  child.kill('SIGTERM')
  
  const result = await new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stdout })
    })
  })
  
  // Should have started the sync process with concurrent processing
  assert.match(result.stdout, /Starting github user repository sync/)
  assert.match(result.stdout, /Concurrency: 3 threads \(parallel\)/)
  assert.match(result.stdout, /Using GitHub token from gh CLI/)
})

test('single-thread mode should show sequential configuration', async () => {
  // Test single-thread mode configuration
  const result = await runScript(['--user', 'nonexistent-sequential-user', '--single-thread', '--dir', testDir])
  
  // Should fail gracefully with API error
  assert.equal(result.code, 1)
  
  // Should show correct concurrency setting
  assert.match(result.stdout, /Concurrency: 1 thread \(sequential\)/)
  
  // Should show proper error handling
  assert.match(result.stdout, /User 'nonexistent-sequential-user' not found/)
})

test.run()