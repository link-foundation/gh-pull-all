#!/usr/bin/env bun

import path from 'path'

// Test uncommitted changes handling
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
import { promises as fs, statSync } from 'fs'
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

async function testUncommittedChanges() {
  const testDir = path.join(os.tmpdir(), 'pull-all-test-uncommitted-changes')
  
  try {
    log('blue', '🧪 Testing uncommitted changes handling...')
    
    // Clean up any existing test directory
    await fs.rm(testDir, {recursive: true, force: true})
    
    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true })
    
    // First, clone some repositories using a known user with limited repos
    log('cyan', '🔧 Step 1: Cloning repositories initially...')
    try {
      // Use deep-assistant org
      const result = execSync(`../pull-all.mjs --org deep-assistant --threads 1 --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
      log('green', '✅ Initial clone completed')
      log('dim', `Output: ${result.slice(-300)}...`) // Show end of output
    } catch (error) {
      // If timeout, that's OK - we probably got some repositories
      if (error.code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
        log('yellow', '⚠️ Clone timed out, but may have gotten some repositories')
        if (error.stdout) {
          log('dim', `Last output: ${error.stdout.slice(-300)}...`)
        }
      } else {
        log('red', `❌ Initial clone failed: ${error.message}`)
        if (error.stdout) {
          log('yellow', `Stdout: ${error.stdout.slice(0, 500)}...`)
        }
        if (error.stderr) {
          log('yellow', `Stderr: ${error.stderr.slice(0, 500)}...`)
        }
        throw error
      }
    }
    
    // Wait a moment for file system to settle
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Add uncommitted changes to some repositories
    log('cyan', '🔧 Step 2: Adding uncommitted changes to repositories...')
    
    // Check if directory exists and list contents for debugging
    try {
      const dirStats = await fs.stat(testDir)
      log('cyan', `🔍 Directory exists: ${dirStats.isDirectory()}`)
      log('cyan', `🔍 Directory path: ${testDir}`)
      
      // List all files/directories in the test directory
      const allItems = await fs.readdir(testDir, { withFileTypes: true })
      log('cyan', `🔍 All items in directory: ${allItems.map(item => `${item.name}${item.isDirectory() ? '/' : ''}`).join(', ')}`)
    } catch (error) {
      log('red', `❌ Directory doesn't exist: ${error.message}`)
      throw error
    }
    
    const repos = await fs.readdir(testDir)
    log('cyan', `🔍 Raw repos list: ${repos.join(', ')}`)
    
    const validRepos = repos.filter(repo => {
      try {
        const stat = statSync(path.join(testDir, repo))
        return stat.isDirectory()
      } catch (error) {
        return false
      }
    })
    
    log('cyan', `🔍 Found repositories: ${validRepos.join(', ')} (${validRepos.length} total)`)
    
    if (validRepos.length < 2) {
      throw new Error(`Need at least 2 repositories for uncommitted changes test, found ${validRepos.length}: ${validRepos.join(', ')}`)
    }
    
    // Add uncommitted changes to first two repos
    await fs.writeFile(path.join(testDir, validRepos[0], 'test-uncommitted-1.txt'), 'This is an uncommitted change')
    await fs.writeFile(path.join(testDir, validRepos[1], 'test-uncommitted-2.txt'), 'This is another uncommitted change')
    
    log('cyan', `🔧 Added uncommitted changes to ${validRepos[0]} and ${validRepos[1]}`)
    
    // Now run the script again to test pull behavior with uncommitted changes
    log('cyan', '🔧 Step 3: Running pull with uncommitted changes...')
    
    let result
    try {
      result = execSync(`../pull-all.mjs --org deep-assistant --threads 2 --no-live-updates --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      result = execError.stdout || ''
    }
    
    log('green', '✅ Uncommitted changes test completed')
    
    // Check for uncommitted changes status (🔄)
    if (result.includes('🔄')) {
      log('green', '✅ Uncommitted changes status icon found')
    } else {
      throw new Error('Expected uncommitted changes status icon not found')
    }
    
    // Check for "Has uncommitted changes, skipped" message
    if (result.includes('Has uncommitted changes, skipped')) {
      log('green', '✅ Uncommitted changes skip message found')
    } else {
      throw new Error('Expected uncommitted changes skip message not found')
    }
    
    // Check for uncommitted count in summary
    if (result.includes('🔄 Uncommitted changes:')) {
      log('green', '✅ Uncommitted changes count found in summary')
    } else {
      throw new Error('Expected uncommitted changes count not found in summary')
    }
    
    // Check that other repos were still pulled successfully
    if (result.includes('Successfully pulled')) {
      log('green', '✅ Other repositories were pulled successfully')
    } else {
      throw new Error('Expected successful pulls for clean repositories not found')
    }
    
    // Verify the uncommitted files still exist
    const uncommittedFile1 = path.join(testDir, validRepos[0], 'test-uncommitted-1.txt')
    const uncommittedFile2 = path.join(testDir, validRepos[1], 'test-uncommitted-2.txt')
    
    if (await fs.access(uncommittedFile1).then(() => true).catch(() => false) && 
        await fs.access(uncommittedFile2).then(() => true).catch(() => false)) {
      log('green', '✅ Uncommitted files preserved (not overwritten)')
    } else {
      throw new Error('Uncommitted files were not preserved')
    }
    
    // Check that repositories with uncommitted changes were not updated
    const lines = result.split('\n')
    const uncommittedLines = lines.filter(line => line.includes('🔄') && line.includes('uncommitted'))
    
    if (uncommittedLines.length >= 2) {
      log('green', `✅ Found ${uncommittedLines.length} repositories with uncommitted changes properly handled`)
    } else {
      log('yellow', `⚠️ Expected at least 2 uncommitted repositories, found ${uncommittedLines.length}`)
    }
    
    log('green', '🎉 Uncommitted changes test passed!')
    
  } catch (error) {
    log('red', `❌ Uncommitted changes test failed: ${error.message}`)
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
testUncommittedChanges().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})