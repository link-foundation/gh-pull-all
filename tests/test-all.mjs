#!/usr/bin/env bun

// Master test runner for all pull-all.mjs tests
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
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

// Test descriptions for enhanced reporting (when available)
const testDescriptions = {
  'test-single-thread.mjs': 'Tests single-thread mode with live updates and append-only behavior',
  'test-multithread-live.mjs': 'Tests multi-thread mode with live in-place updates',
  'test-multithread-no-live.mjs': 'Tests multi-thread mode with append-only final status',
  'test-error-handling.mjs': 'Tests error numbering system and error list display',
  'test-terminal-width.mjs': 'Tests terminal width handling and message truncation',
  'test-uncommitted-changes.mjs': 'Tests handling of repositories with uncommitted changes',
  'test-integration.mjs': 'Tests all functionality together in complex scenarios',
  'test-cli-simple.mjs': 'Tests basic CLI functionality and argument parsing',
  'test-file-operations.mjs': 'Tests file system operations and directory handling',
  'test-github-api.mjs': 'Tests GitHub API integration and error handling',
  'test-parallel.mjs': 'Tests parallel processing functionality',
  'test-terminal-output.mjs': 'Tests terminal output formatting and colors',
  'test-threading.mjs': 'Tests threading and concurrency management',
  'test-sorting.mjs': 'Tests alphabetical sorting of repositories'
}

function getTestDisplayName(filename) {
  // Convert filename to display name
  return filename
    .replace('test-', '')
    .replace('.mjs', '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function discoverTests() {
  // Find all test files (excluding test-all.mjs)
  const files = await fs.readdir('.')
  const testFilePattern = /^test-.*\.mjs$/
  return files
    .filter(file => testFilePattern.test(file) && file !== 'test-all.mjs')
    .sort()
}

async function runAllTests() {
  const startTime = Date.now()
  let passedTests = 0
  let failedTests = 0
  const results = []
  
  log('blue', `${colors.bold}🧪 Pull-All Test Suite${colors.reset}`)
  
  // Discover all test files
  const testFiles = await discoverTests()
  
  if (testFiles.length === 0) {
    log('yellow', '⚠️  No test files found')
    return
  }
  
  log('cyan', `Running ${testFiles.length} test suites...`)
  log('cyan', `Found test files: ${testFiles.join(', ')}`)
  log('dim', '─'.repeat(80))
  
  for (const testFile of testFiles) {
    const testStartTime = Date.now()
    const displayName = getTestDisplayName(testFile)
    const description = testDescriptions[testFile] || 'Test suite'
    
    log('cyan', `\n🔍 Running: ${displayName}`)
    log('dim', `   File: ${testFile}`)
    log('dim', `   ${description}`)
    
    try {
      const result = execSync(`./${testFile}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
      
      const testDuration = ((Date.now() - testStartTime) / 1000).toFixed(1)
      log('green', `✅ ${displayName} passed (${testDuration}s)`)
      passedTests++
      
      results.push({
        name: displayName,
        file: testFile,
        status: 'passed',
        duration: testDuration,
        output: result
      })
      
    } catch (error) {
      const testDuration = ((Date.now() - testStartTime) / 1000).toFixed(1)
      log('red', `❌ ${displayName} failed (${testDuration}s)`)
      log('red', `   Error: ${error.message}`)
      if (error.stdout) {
        log('dim', `   Output: ${error.stdout.slice(0, 200)}...`)
      }
      failedTests++
      
      results.push({
        name: displayName,
        file: testFile,
        status: 'failed',
        duration: testDuration,
        error: error.message,
        output: error.stdout || ''
      })
    }
  }
  
  // Print final summary
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  
  log('dim', '\n' + '─'.repeat(80))
  log('blue', `\n${colors.bold}📊 Test Suite Summary${colors.reset}`)
  
  if (passedTests > 0) {
    log('green', `✅ Passed: ${passedTests}/${testFiles.length} tests`)
  }
  
  if (failedTests > 0) {
    log('red', `❌ Failed: ${failedTests}/${testFiles.length} tests`)
    
    // List failed tests
    log('red', '\nFailed Tests:')
    results.filter(r => r.status === 'failed').forEach(result => {
      log('red', `  • ${result.name} (${result.file}): ${result.error}`)
    })
  }
  
  log('blue', `⏱️  Total time: ${totalDuration}s`)
  
  if (failedTests === 0) {
    log('green', `\n🎉 All tests passed! The pull-all.mjs implementation is working correctly.`)
    log('magenta', '✨ Features validated across all test suites:')
    log('magenta', '   • Single-thread and multi-thread modes')
    log('magenta', '   • Live updates and append-only display modes')
    log('magenta', '   • Error numbering and error list display')
    log('magenta', '   • Terminal width handling and message truncation')
    log('magenta', '   • Uncommitted changes detection and handling')
    log('magenta', '   • GitHub CLI integration with extended API limits')
    log('magenta', '   • GitHub API error handling and network resilience')
    log('magenta', '   • File operations and directory management')
    log('magenta', '   • CLI argument parsing and validation')
    log('magenta', '   • Parallel processing and threading')
    log('magenta', '   • Terminal output formatting and colors')
    log('magenta', '   • Proper cleanup of cross-platform temporary directories')
  } else {
    log('red', `\n💥 ${failedTests} test(s) failed. Please review and fix the issues.`)
    process.exit(1)
  }
}

// Run all tests
runAllTests().catch(error => {
  log('red', `💥 Test runner failed: ${error.message}`)
  process.exit(1)
})