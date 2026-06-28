#!/usr/bin/env bun

// Test parallel processing functionality
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
const { spawn } = await import('child_process')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliPath = path.join(__dirname, '..', 'gh-pull-all.mjs')
let testDir

test.before(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-parallel-demo-'))
})

test.after(async () => {
  // Clean up test directory
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

function waitForOutput(child, getOutput, pattern, maxWaitMs = 15000) {
  return new Promise((resolve) => {
    let settled = false

    const finish = (matched) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(matched)
    }

    const checkOutput = () => {
      if (pattern.test(getOutput())) {
        finish(true)
      }
    }

    const timer = setTimeout(() => finish(false), maxWaitMs)
    child.stdout.on('data', checkOutput)
    child.on('close', () => {
      checkOutput()
      finish(pattern.test(getOutput()))
    })
    checkOutput()
  })
}

function runScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
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

test('parallel processing should handle invalid user gracefully', async () => {
  const result = await runScript(['--user', 'nonexistent-parallel-test-user', '--dir', testDir])
  
  assert.equal(result.code, 1)
  assert.match(result.stdout, /User 'nonexistent-parallel-test-user' not found/)
})

test('parallel processing should initialize status display', async () => {
  // Test with a very simple case that will start the parallel processing
  const child = spawn(process.execPath, [cliPath, '--user', 'github', '--dir', testDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
    detached: process.platform !== 'win32'
  })
  
  let stdout = ''
  child.stdout.on('data', (data) => {
    stdout += data.toString()
  })

  let stderr = ''
  child.stderr.on('data', (data) => {
    stderr += data.toString()
  })

  const closePromise = new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })

  const initialized = await waitForOutput(child, () => stdout, /Concurrency: 8 threads \(parallel\)/)
  terminateChildTree(child)

  const result = await closePromise

  // Should have started the parallel sync process
  assert.ok(initialized, `Expected startup output before termination.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  assert.match(result.stdout, /Starting github user repository sync/)
  assert.match(result.stdout, /Concurrency: 8 threads \(parallel\)/)
})

test('parallel script should show improved output format', async () => {
  // Test that the script uses the new parallel format by checking for specific output patterns
  const result = await runScript(['--user', 'nonexistent-test-user', '--dir', testDir])
  
  // Should fail gracefully with our new error handling
  assert.equal(result.code, 1)
  assert.match(result.stdout, /Starting nonexistent-test-user user repository sync/)
})

test.run()
