#!/usr/bin/env bun

// Integration test for Issue #11 - Short error messages in status display
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

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

async function testIssue11Integration() {
  const testDir = path.join(os.tmpdir(), 'gh-pull-all-test-issue-11-integration')
  
  try {
    log('blue', '🧪 Testing Issue #11 integration (short error messages)...')
    
    // Clean up any existing test directory
    await fs.rm(testDir, {recursive: true, force: true})
    await fs.mkdir(testDir, {recursive: true})
    
    // Create conflicting files to force errors
    await fs.writeFile(path.join(testDir, 'Spoon-Knife'), 'conflicting file content')
    await fs.writeFile(path.join(testDir, 'Hello-World'), 'another conflicting file')
    
    log('cyan', '🔧 Created conflicting files to trigger errors')
    
    // Test with different modes to ensure consistency
    const testCases = [
      { name: 'Multi-threaded with live updates', args: '--threads 2' },
      { name: 'Multi-threaded without live updates', args: '--threads 2 --no-live-updates' },
      { name: 'Single-threaded', args: '--single-thread' }
    ]
    
    for (const testCase of testCases) {
      log('cyan', `🔧 Testing: ${testCase.name}`)
      
      let result
      try {
        result = execSync(`../gh-pull-all.mjs --user octocat ${testCase.args} --dir ${testDir}`, {
          encoding: 'utf8',
          stdio: 'pipe'
        })
      } catch (execError) {
        // The command might return non-zero exit code due to errors, but we still want the output
        result = execError.stdout || ''
      }
      
      // Validate the short error format in status display
      const statusLines = result.split('\n').filter(line => line.includes('❌'))
      let hasShortErrorFormat = false
      
      for (const line of statusLines) {
        if (line.includes('Failed with error #')) {
          hasShortErrorFormat = true
          
          // Ensure it doesn't contain full error details
          if (line.includes('destination path') || 
              line.includes('already exists and is not an empty directory') ||
              line.includes('from the remote, but no such ref was fetched')) {
            throw new Error(`Status line contains full error message in ${testCase.name}: ${line}`)
          }
        }
      }
      
      if (!hasShortErrorFormat) {
        throw new Error(`No short error format found in ${testCase.name}`)
      }
      
      // Validate that full error details are in the errors section
      if (!result.includes('❌ Errors:')) {
        throw new Error(`Errors section missing in ${testCase.name}`)
      }
      
      const errorsSectionStart = result.indexOf('❌ Errors:')
      const errorsSection = result.substring(errorsSectionStart)
      
      if (!errorsSection.includes('destination path') && 
          !errorsSection.includes('already exists')) {
        throw new Error(`Full error details missing from errors section in ${testCase.name}`)
      }
      
      log('green', `✅ ${testCase.name} passed`)
    }
    
    // Test that successful operations still work normally
    log('cyan', '🔧 Testing successful operations still display correctly')
    
    const cleanTestDir = path.join(os.tmpdir(), 'gh-pull-all-test-issue-11-clean')
    await fs.rm(cleanTestDir, {recursive: true, force: true})
    await fs.mkdir(cleanTestDir, {recursive: true})
    
    let successResult
    try {
      successResult = execSync(`../gh-pull-all.mjs --user octocat --threads 1 --dir ${cleanTestDir}`, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000 // 30 second timeout for success case
      })
    } catch (execError) {
      successResult = execError.stdout || ''
    }
    
    // Should have successful clones without error messages
    const successLines = successResult.split('\n').filter(line => line.includes('✅'))
    
    if (successLines.length === 0) {
      throw new Error('No successful operations found in clean test')
    }
    
    // Should not contain "Failed with error" in success cases
    if (successResult.includes('Failed with error #')) {
      throw new Error('Success case should not contain error messages')
    }
    
    log('green', '✅ Successful operations display correctly')
    
    // Clean up clean directory
    await fs.rm(cleanTestDir, {recursive: true, force: true})
    
    log('green', '🎉 Issue #11 integration test passed!')
    
  } catch (error) {
    log('red', `❌ Issue #11 integration test failed: ${error.message}`)
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
testIssue11Integration().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})