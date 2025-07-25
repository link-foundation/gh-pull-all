#!/usr/bin/env bun

// Test multi-thread mode with live updates
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

async function testMultiThreadLive() {
  const testDir = path.join(os.tmpdir(), 'pull-all-test-multithread-live')
  
  try {
    log('blue', '🧪 Testing multi-thread mode with live updates...')
    
    // Clean up any existing test directory
    await fs.remove(testDir)
    
    // Run the script in multi-thread mode with live updates
    const result = execSync(`./pull-all.mjs --user octocat --threads 4 --live-updates --dir ${testDir}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    })
    
    log('green', '✅ Multi-thread live updates test completed successfully')
    
    // Verify repositories were cloned
    const repos = await fs.readdir(testDir)
    if (repos.length > 0) {
      log('green', `✅ Found ${repos.length} repositories cloned`)
    } else {
      throw new Error('No repositories were cloned')
    }
    
    // Check that we can see intermediate states in output (cloning/pulling messages)
    if (result.includes('Starting clone') || result.includes('📦')) {
      log('green', '✅ Intermediate status messages found in output')
    } else {
      log('yellow', '⚠️ No intermediate states found (may be normal in non-TTY)')
    }
    
    // Check for successful completion messages
    if (result.includes('Successfully cloned') || result.includes('Successfully pulled')) {
      log('green', '✅ Final status messages found in output')
    } else {
      throw new Error('Expected final status messages not found in output')
    }
    
    // Check for concurrency indication
    if (result.includes('4 threads (parallel)')) {
      log('green', '✅ Concurrency setting correctly displayed')
    } else {
      throw new Error('Expected concurrency information not found')
    }
    
    log('green', '🎉 Multi-thread live updates test passed!')
    
  } catch (error) {
    log('red', `❌ Multi-thread live updates test failed: ${error.message}`)
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
testMultiThreadLive().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})