#!/usr/bin/env bun

// Test error handling and numbering system
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

async function testErrorHandling() {
  const testDir = path.join(os.tmpdir(), 'gh-pull-all-test-error-handling')
  
  try {
    log('blue', '🧪 Testing error handling and numbering system...')
    
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
    
    log('green', '✅ Error handling test completed')
    
    // Check for error numbering in status messages (Issue #11: now uses short format)
    if (result.includes('Failed with error #1') || result.includes('Failed with error #2')) {
      log('green', '✅ Error numbering found in status messages')
    } else {
      throw new Error('Expected error numbering not found in status messages')
    }
    
    // Check for errors section after status list
    if (result.includes('❌ Errors:')) {
      log('green', '✅ Errors section found after status list')
    } else {
      throw new Error('Expected errors section not found')
    }
    
    // Check for full error details in errors section
    if (result.includes('destination path') && result.includes('already exists')) {
      log('green', '✅ Full error details found in errors section')
    } else {
      throw new Error('Expected full error details not found')
    }
    
    // Check for failed summary count
    if (result.includes('❌ Failed:')) {
      log('green', '✅ Failed count found in summary')
    } else {
      throw new Error('Expected failed count not found in summary')
    }
    
    // Verify some repos still succeeded
    const repos = await fs.readdir(testDir)
    const validRepos = repos.filter(repo => {
      try {
        const stat = fs.statSync(path.join(testDir, repo))
        return stat.isDirectory()
      } catch {
        return false
      }
    })
    
    if (validRepos.length > 0) {
      log('green', `✅ Found ${validRepos.length} successfully cloned repositories despite errors`)
    }
    
    log('green', '🎉 Error handling test passed!')
    
  } catch (error) {
    log('red', `❌ Error handling test failed: ${error.message}`)
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
testErrorHandling().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})