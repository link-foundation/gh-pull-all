#!/usr/bin/env bun

import path from 'path'

// Comprehensive integration test covering all functionality
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
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

async function testIntegration() {
  const testDir = path.join(os.tmpdir(), 'pull-all-test-integration')
  
  try {
    log('blue', '🧪 Running comprehensive integration test...')
    log('cyan', '🔍 This test combines all functionality: threading, errors, uncommitted changes, and terminal width')
    
    // Clean up any existing test directory
    await fs.rm(testDir, {recursive: true, force: true})
    await fs.mkdir(testDir, {recursive: true})
    
    // === PHASE 1: Initial clone with mixed scenarios ===
    log('cyan', '🔧 Phase 1: Setting up mixed scenario environment...')
    
    // Create conflicting files for some repos (to test error handling)
    await fs.writeFile(path.join(testDir, 'Spoon-Knife'), 'conflicting file content to trigger error #1')
    await fs.writeFile(path.join(testDir, 'Hello-World'), 'conflicting file content to trigger error #2')
    
    // Run initial clone with errors expected
    let phase1Result
    try {
      phase1Result = execSync(`../pull-all.mjs --user octocat --threads 3 --no-live-updates --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      phase1Result = execError.stdout || ''
    }
    
    log('green', '✅ Phase 1 completed: Initial clone with errors')
    
    // === PHASE 2: Add uncommitted changes ===
    log('cyan', '🔧 Phase 2: Adding uncommitted changes to successful clones...')
    
    const repos = await fs.readdir(testDir)
    const validRepos = repos.filter(repo => {
      try {
        const stat = fs.statSync(path.join(testDir, repo))
        return stat.isDirectory()
      } catch {
        return false
      }
    })
    
    if (validRepos.length >= 2) {
      // Add uncommitted changes to first two successful repos
      await fs.writeFile(path.join(testDir, validRepos[0], 'uncommitted-test.txt'), 'uncommitted change 1')
      await fs.writeFile(path.join(testDir, validRepos[1], 'uncommitted-test.txt'), 'uncommitted change 2')
      log('cyan', `🔧 Added uncommitted changes to ${validRepos[0]} and ${validRepos[1]}`)
    }
    
    // === PHASE 3: Test pull with mixed states ===
    log('cyan', '🔧 Phase 3: Running pull with mixed repository states...')
    
    let phase3Result
    try {
      phase3Result = execSync(`../pull-all.mjs --user octocat --threads 2 --no-live-updates --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      phase3Result = execError.stdout || ''
    }
    
    log('green', '✅ Phase 3 completed: Pull with mixed states')
    
    // === PHASE 4: Test single-thread mode ===
    log('cyan', '🔧 Phase 4: Testing single-thread mode behavior...')
    
    // Remove one error file to change the scenario
    await fs.rm(path.join(testDir, 'Spoon-Knife'), {recursive: true, force: true})
    
    let phase4Result
    try {
      phase4Result = execSync(`../pull-all.mjs --user octocat --single-thread --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      phase4Result = execError.stdout || ''
    }
    
    log('green', '✅ Phase 4 completed: Single-thread mode')
    
    // === COMPREHENSIVE VALIDATION ===
    log('cyan', '🔍 Validating all functionality...')
    
    const allResults = phase1Result + '\n' + phase3Result + '\n' + phase4Result
    
    // Test 1: Error numbering and handling
    const errorNumbers = (allResults.match(/Error #\d+:/g) || []).length
    if (errorNumbers > 0) {
      log('green', `✅ Error numbering: Found ${errorNumbers} numbered errors`)
    } else {
      throw new Error('Expected error numbering not found')
    }
    
    // Test 2: Error list display
    if (allResults.includes('❌ Errors:')) {
      log('green', '✅ Error list: Errors section displayed')
    } else {
      throw new Error('Expected errors section not found')
    }
    
    // Test 3: Uncommitted changes handling
    if (allResults.includes('🔄') && allResults.includes('uncommitted changes')) {
      log('green', '✅ Uncommitted changes: Properly detected and handled')
    } else {
      throw new Error('Expected uncommitted changes handling not found')
    }
    
    // Test 4: Threading modes
    if (allResults.includes('threads (parallel)') && allResults.includes('thread (sequential)')) {
      log('green', '✅ Threading modes: Both parallel and sequential tested')
    } else {
      log('yellow', '⚠️ Threading modes: Not all modes clearly identified')
    }
    
    // Test 5: Status variety
    const statusTypes = {
      success: (allResults.match(/✅/g) || []).length,
      failed: (allResults.match(/❌/g) || []).length,
      uncommitted: (allResults.match(/🔄/g) || []).length
    }
    
    if (statusTypes.success > 0 && statusTypes.failed > 0 && statusTypes.uncommitted > 0) {
      log('green', `✅ Status variety: Success(${statusTypes.success}), Failed(${statusTypes.failed}), Uncommitted(${statusTypes.uncommitted})`)
    } else {
      log('yellow', `⚠️ Status variety: Success(${statusTypes.success}), Failed(${statusTypes.failed}), Uncommitted(${statusTypes.uncommitted})`)
    }
    
    // Test 6: Summary sections
    if (allResults.includes('📊 Summary:')) {
      log('green', '✅ Summary sections: Present in all test runs')
    } else {
      throw new Error('Expected summary sections not found')
    }
    
    // Test 7: Message truncation (check for ellipsis)
    if (allResults.includes('...')) {
      log('green', '✅ Message truncation: Found truncated messages')
    } else {
      log('yellow', '⚠️ Message truncation: No truncation detected (may be normal)')
    }
    
    // Test 8: GitHub CLI integration
    if (allResults.includes('Using GitHub token from gh CLI') || allResults.includes('Using gh CLI to fetch repositories')) {
      log('green', '✅ GitHub CLI integration: Successfully used gh CLI')
    } else {
      log('yellow', '⚠️ GitHub CLI integration: gh CLI usage not detected')
    }
    
    // Test 9: Concurrency settings
    const concurrencyMatches = allResults.match(/Concurrency: \d+ thread/g) || []
    if (concurrencyMatches.length > 0) {
      log('green', `✅ Concurrency settings: Found ${concurrencyMatches.length} concurrency configurations`)
    } else {
      throw new Error('Expected concurrency settings not found')
    }
    
    // Final validation: Check file system state
    const finalRepos = await fs.readdir(testDir)
    const finalValidRepos = finalRepos.filter(repo => {
      try {
        const stat = fs.statSync(path.join(testDir, repo))
        return stat.isDirectory()
      } catch {
        return false
      }
    })
    
    if (finalValidRepos.length > 0) {
      log('green', `✅ File system: ${finalValidRepos.length} repositories successfully managed`)
    } else {
      throw new Error('No valid repositories found in final state')
    }
    
    log('green', '🎉 Comprehensive integration test passed!')
    log('magenta', '✨ All major functionality validated successfully')
    
  } catch (error) {
    log('red', `❌ Integration test failed: ${error.message}`)
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
testIntegration().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})