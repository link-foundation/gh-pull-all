#!/usr/bin/env bun

// Integration test for Issue #11 - Short error messages in status display
// Download use-m dynamically
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const os = await import('os')
const { execFileSync } = await import('child_process')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'gh-pull-all.mjs')

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

function formatOutput(stdout, stderr) {
  return [stdout, stderr].filter(Boolean).join('\n')
}

function runGhPullAll(args, options = {}) {
  const { allowFailure = false, ...execOptions } = options

  try {
    return execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...execOptions
    })
  } catch (error) {
    const stdout = error.stdout || ''
    const stderr = error.stderr || ''

    if (allowFailure) {
      return formatOutput(stdout, stderr)
    }

    throw new Error(formatOutput(
      `Command failed: ${process.execPath} ${scriptPath} ${args.join(' ')}`,
      formatOutput(stdout, stderr) || error.message
    ))
  }
}

function getDiagnosticOutput(output) {
  const maxLength = 4000
  return output.length > maxLength ? `${output.slice(0, maxLength)}\n...<truncated>` : output
}

async function testIssue11Integration() {
  let testRoot
  
  try {
    log('blue', '🧪 Testing Issue #11 integration (short error messages)...')
    
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-test-issue-11-'))
    const testDir = path.join(testRoot, 'integration')
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
      result = runGhPullAll([
        '--user',
        'octocat',
        ...testCase.args.split(' '),
        '--dir',
        testDir
      ], { allowFailure: true })
      
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
        throw new Error(
          `No short error format found in ${testCase.name}\n` +
          getDiagnosticOutput(result)
        )
      }
      
      // Validate that full error details are in the errors section
      if (!result.includes('❌ Errors:')) {
        throw new Error(
          `Errors section missing in ${testCase.name}\n` +
          getDiagnosticOutput(result)
        )
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
    
    const cleanTestDir = path.join(testRoot, 'clean')
    await fs.mkdir(cleanTestDir, {recursive: true})
    
    let successResult
    successResult = runGhPullAll([
      '--user',
      'octocat',
      '--threads',
      '1',
      '--dir',
      cleanTestDir
    ], { timeout: 30000 })
    
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
    
    log('green', '🎉 Issue #11 integration test passed!')
    
  } catch (error) {
    log('red', `❌ Issue #11 integration test failed: ${error.message}`)
    throw error
  } finally {
    // Clean up
    try {
      if (testRoot) {
        await fs.rm(testRoot, {recursive: true, force: true})
      }
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
