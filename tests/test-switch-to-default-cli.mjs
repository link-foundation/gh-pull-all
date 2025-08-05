#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Test CLI argument validation for --switch-to-default functionality
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import dependencies
const { execSync } = await import('child_process')
const path = await import('path')

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

async function testSwitchToDefaultCLI() {
  const scriptPath = path.join(process.cwd(), '../gh-pull-all.mjs')
  
  log('blue', '🧪 Testing switch-to-default CLI functionality...')
  
  try {
    // Test 1: Help text should include --switch-to-default option
    log('cyan', '\n📋 Test 1: Verify --switch-to-default appears in help text')
    try {
      const helpOutput = execSync(`node "${scriptPath}" --help`, { encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      // Help command fails with exit code due to missing args, but we can still check the output
      const helpOutput = error.stdout || error.message
      
      if (helpOutput.includes('--switch-to-default')) {
        log('green', '✅ --switch-to-default option found in help text')
      } else {
        log('red', '❌ --switch-to-default option not found in help text')
        log('red', `Output: ${helpOutput.substring(0, 500)}...`)
        process.exit(1)
      }
      
      if (helpOutput.includes('Switch to the default branch') && helpOutput.includes('in each')) {
        log('green', '✅ --switch-to-default description found in help text')
      } else {
        log('red', '❌ --switch-to-default description not found in help text')
        log('red', `Output: ${helpOutput.substring(0, 500)}...`)
        process.exit(1)
      }
      
      if (helpOutput.includes('Switch all repositories to their') && helpOutput.includes('--switch-to-default')) {
        log('green', '✅ --switch-to-default example found in help text')
      } else {
        log('red', '❌ --switch-to-default example not found in help text')
        log('red', `Output: ${helpOutput.substring(0, 500)}...`)
        process.exit(1)
      }
    }
    
    // Test 2: Conflicting options should be rejected
    log('cyan', '\n📋 Test 2: Verify conflicting options are rejected')
    try {
      const conflictOutput = execSync(`node "${scriptPath}" --user test --pull-from-default --switch-to-default`, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      })
      log('red', '❌ Script should have failed with conflicting options')
      process.exit(1)
    } catch (error) {
      if (error.message.includes('Cannot specify both --pull-from-default and --switch-to-default')) {
        log('green', '✅ Conflicting options properly rejected')
      } else {
        log('red', `❌ Unexpected error message: ${error.message}`)
        process.exit(1)
      }
    }
    
    // Test 3: Missing required arguments should be rejected
    log('cyan', '\n📋 Test 3: Verify missing required arguments are rejected')
    try {
      const missingArgsOutput = execSync(`node "${scriptPath}" --switch-to-default`, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      })
      log('red', '❌ Script should have failed with missing required arguments')
      process.exit(1)
    } catch (error) {
      if (error.message.includes('You must specify either --org or --user')) {
        log('green', '✅ Missing required arguments properly rejected')
      } else {
        log('red', `❌ Unexpected error message: ${error.message}`)
        process.exit(1)
      }
    }
    
    // Test 4: Valid combination should pass argument validation
    log('cyan', '\n📋 Test 4: Verify valid arguments pass validation')
    try {
      // This will fail due to network/API call, but argument validation should pass
      const validArgsOutput = execSync(`node "${scriptPath}" --user nonexistent-test-user-12345 --switch-to-default --single-thread`, { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 5000 // 5 second timeout to avoid long waits
      })
    } catch (error) {
      // We expect this to fail due to network/API issues, but not due to argument validation
      if (error.message.includes('Cannot specify both') || error.message.includes('You must specify either')) {
        log('red', `❌ Valid arguments were incorrectly rejected: ${error.message}`)
        process.exit(1)
      } else {
        log('green', '✅ Valid arguments passed validation (failed later due to network/API, which is expected)')
      }
    }
    
    log('green', '\n🎉 All switch-to-default CLI tests passed!')
    
  } catch (error) {
    log('red', `💥 Test failed: ${error.message}`)
    console.error(error)
    process.exit(1)
  }
}

// Run the test
testSwitchToDefaultCLI()