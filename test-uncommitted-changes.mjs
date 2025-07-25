#!/usr/bin/env bun

// Test uncommitted changes handling
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
const fs = await use('fs-extra@latest')
const path = await use('path@latest')
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
    await fs.remove(testDir)
    
    // First, clone repositories normally
    log('cyan', '🔧 Step 1: Cloning repositories initially...')
    execSync(`./pull-all.mjs --user octocat --threads 2 --dir ${testDir}`, {
      stdio: 'pipe'
    })
    
    // Add uncommitted changes to some repositories
    log('cyan', '🔧 Step 2: Adding uncommitted changes to repositories...')
    
    const repos = await fs.readdir(testDir)
    const validRepos = repos.filter(repo => {
      try {
        const stat = fs.statSync(path.join(testDir, repo))
        return stat.isDirectory()
      } catch {
        return false
      }
    })
    
    if (validRepos.length < 2) {
      throw new Error('Need at least 2 repositories for uncommitted changes test')
    }
    
    // Add uncommitted changes to first two repos
    await fs.writeFile(path.join(testDir, validRepos[0], 'test-uncommitted-1.txt'), 'This is an uncommitted change')
    await fs.writeFile(path.join(testDir, validRepos[1], 'test-uncommitted-2.txt'), 'This is another uncommitted change')
    
    log('cyan', `🔧 Added uncommitted changes to ${validRepos[0]} and ${validRepos[1]}`)
    
    // Now run the script again to test pull behavior with uncommitted changes
    log('cyan', '🔧 Step 3: Running pull with uncommitted changes...')
    
    let result
    try {
      result = execSync(`./pull-all.mjs --user octocat --threads 2 --no-live-updates --dir ${testDir}`, {
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
    
    if (await fs.pathExists(uncommittedFile1) && await fs.pathExists(uncommittedFile2)) {
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
      await fs.remove(testDir)
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