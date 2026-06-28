#!/usr/bin/env bun

import path from 'path'

// Test single-thread mode with live updates
// Download use-m dynamically
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
const os = await import('os')
const { execSync } = await import('child_process')

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

async function testSingleThread() {
  const testDir = path.join(os.tmpdir(), 'gh-pull-all-test-single-thread')
  
  try {
    log('blue', '🧪 Testing single-thread mode with live updates...')
    
    // Clean up any existing test directory
    await fs.rm(testDir, {recursive: true, force: true})
    
    // Run the script in single-thread mode
    const result = execSync(`../gh-pull-all.mjs --user octocat --single-thread --dir ${testDir}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    })
    
    log('green', '✅ Single-thread test completed successfully')
    
    // Verify repositories were cloned
    const repos = await fs.readdir(testDir)
    if (repos.length > 0) {
      log('green', `✅ Found ${repos.length} repositories cloned`)
    } else {
      throw new Error('No repositories were cloned')
    }
    
    // Check that we can see intermediate states in output
    if (result.includes('Successfully cloned') || result.includes('Successfully pulled')) {
      log('green', '✅ Final status messages found in output')
    } else {
      throw new Error('Expected status messages not found in output')
    }
    
    log('green', '🎉 Single-thread test passed!')
    
  } catch (error) {
    log('red', `❌ Single-thread test failed: ${error.message}`)
    throw error
  } finally {
    // Clean up
    try {
      await fs.rm(testDir, {recursive: true, force: true})
      log('cyan', '🧹 Cleaned up test directory')
    } catch (cleanupError) {
      log('yellow', `⚠️ Cleanup warning: ${cleanupError.message}`)
    }
  }
}

// Run the test
testSingleThread().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})