#!/usr/bin/env bun

// Test error message display - Issue #19
// Download use-m dynamically
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
import path from 'path'
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

async function testErrorMessageDisplay() {
  const testDir = path.join(os.tmpdir(), 'gh-pull-all-test-error-message-display')
  
  try {
    log('blue', '🧪 Testing error message display (Issue #19)...')
    
    // Clean up any existing test directory
    await fs.rm(testDir, {recursive: true, force: true})
    await fs.mkdir(testDir, {recursive: true})
    
    // Create conflicting files to force errors
    await fs.writeFile(path.join(testDir, 'Spoon-Knife'), 'conflicting file content')
    await fs.writeFile(path.join(testDir, 'Hello-World'), 'another conflicting file')
    
    log('cyan', '🔧 Created conflicting files to trigger errors')
    
    // Run the script and expect some failures
    let result
    try {
      result = execSync(`../gh-pull-all.mjs --user octocat --threads 2 --no-live-updates --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      // The command might return non-zero exit code due to errors, but we still want the output
      result = execError.stdout || ''
    }
    
    log('green', '✅ Error message display test completed')
    log('dim', 'Output preview:')
    console.log(result.split('\n').slice(0, 20).join('\n'))
    
    // NEW TEST: Check that status messages show short error format
    const statusLines = result.split('\n').filter(line => line.includes('❌'))
    
    for (const line of statusLines) {
      if (line.includes('Error #')) {
        // Should NOT contain the full error message in status display.
        if (line.includes('Your configuration specifies') || 
            line.includes('already exists and is not an empty directory') ||
            line.includes('from the remote, but no such ref was fetched')) {
          throw new Error(`Status line contains full error message: ${line}`)
        }
        
        if (!/Error #\d+/.test(line)) {
          throw new Error(`Status line should contain 'Error #X' format: ${line}`)
        }
      }
    }
    
    log('green', '✅ Status lines use short error format')
    
    // Check that full error details are still in the errors section
    if (result.includes('❌ Errors:')) {
      log('green', '✅ Errors section found')
      
      // The errors section should contain the full details
      const errorsSectionStart = result.indexOf('❌ Errors:')
      const errorsSection = result.substring(errorsSectionStart)
      
      if (errorsSection.includes('destination path') || 
          errorsSection.includes('already exists') ||
          errorsSection.includes('Your configuration specifies')) {
        log('green', '✅ Full error details found in errors section')
      } else {
        throw new Error('Expected full error details not found in errors section')
      }
    } else {
      throw new Error('Expected errors section not found')
    }
    
    log('green', '🎉 Error message display test passed!')
    
  } catch (error) {
    log('red', `❌ Error message display test failed: ${error.message}`)
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
testErrorMessageDisplay().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})
