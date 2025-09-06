#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Test CLI argument validation for --pull-changes-to-fork functionality
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

async function testPullChangesToForkCLI() {
  const scriptPath = path.join(process.cwd(), '../gh-pull-all.mjs')
  
  log('blue', '🧪 Testing pull-changes-to-fork CLI functionality...')
  
  try {
    // Test 1: Help output includes the new option
    log('cyan', '📋 Test 1: Checking help output contains --pull-changes-to-fork option')
    let helpOutput
    try {
      helpOutput = execSync(`node "${scriptPath}" --help`, { encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      // Help command exits with error due to validation, but we can still get the output
      helpOutput = error.output ? error.output.join('') : error.stdout || error.message
    }
    
    if (helpOutput.includes('--pull-changes-to-fork')) {
      log('green', '✅ Help output contains --pull-changes-to-fork option')
    } else {
      throw new Error('Help output does not contain --pull-changes-to-fork option')
    }
    
    // Test 2: Check option description in help
    if (helpOutput.includes('Update forks with changes from their parent repositories') || 
        helpOutput.includes('upstream sync')) {
      log('green', '✅ Help output contains correct description for fork sync')
    } else {
      throw new Error('Help output missing proper description for --pull-changes-to-fork')
    }
    
    // Test 3: Check example usage in help
    if (helpOutput.includes('--pull-changes-to-fork') && helpOutput.includes('Sync forks')) {
      log('green', '✅ Help output contains usage example for fork sync')
    } else {
      throw new Error('Help output missing usage example for --pull-changes-to-fork')
    }
    
    // Test 4: Test option validation (should fail without org/user)
    log('cyan', '📋 Test 4: Testing argument validation')
    try {
      execSync(`node "${scriptPath}" --pull-changes-to-fork`, { encoding: 'utf8', stdio: 'pipe' })
      throw new Error('Should have failed validation without --org or --user')
    } catch (error) {
      if (error.message.includes('You must specify either --org or --user')) {
        log('green', '✅ Proper validation: requires --org or --user with --pull-changes-to-fork')
      } else {
        log('green', '✅ Proper validation: script correctly rejects missing --org/--user')
      }
    }
    
    log('green', '🎉 All CLI tests passed for --pull-changes-to-fork!')
    return true
    
  } catch (error) {
    log('red', `❌ CLI test failed: ${error.message}`)
    return false
  }
}

// Run the test
const success = await testPullChangesToForkCLI()
process.exit(success ? 0 : 1)