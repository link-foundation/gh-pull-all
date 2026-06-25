#!/usr/bin/env bun

// Test concurrent repository processing with worker pool pattern
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
const { spawn } = await import('child_process')

let testDir

test.before(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-concurrent-processing-'))
})

test.after(async () => {
  await fs.rm(testDir, {recursive: true, force: true, maxRetries: 10, retryDelay: 200})
})

function terminateChildTree(child) {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
      return
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error
      }
    }
  }

  child.kill('SIGTERM')
}

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['../gh-pull-all.mjs', ...args], {
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
  const child = spawn(process.execPath, ['../gh-pull-all.mjs', '--user', 'github', '--dir', testDir, '--threads', '3'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
    detached: process.platform !== 'win32'
  })
  
  let stdout = ''
  child.stdout.on('data', (data) => {
    stdout += data.toString()
  })
  
  // Let it run for a bit then kill to test initialization
  await new Promise(resolve => setTimeout(resolve, 3000))
  terminateChildTree(child)
  
  const result = await new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stdout })
    })
  })
  
  // Should have started the sync process with concurrent processing
  assert.match(result.stdout, /Starting github user repository sync/)
  assert.match(result.stdout, /Concurrency: 3 threads \(parallel\)/)
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
