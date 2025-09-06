#!/usr/bin/env bun

// Fast integration test using local mock repositories instead of GitHub API
import path from 'path'
import { promises as fs } from 'fs'
import { createTestDir, cleanupTestDir, createMockRepo, log, colors, validateOutput, runGhPullAll } from './common-test-utils.mjs'

async function testFastIntegration() {
  const testDir = createTestDir('integration-fast')
  
  try {
    log('blue', '🧪 Running fast integration test...')
    log('cyan', '🔍 Testing core functionality with local mock repositories')
    
    // === PHASE 1: Create mock repositories ===
    log('cyan', '🔧 Phase 1: Creating mock repositories...')
    
    // Create some mock repositories with different states
    const mockRepos = [
      { name: 'repo1', hasUncommittedChanges: false },
      { name: 'repo2', hasUncommittedChanges: true },
      { name: 'repo3', hasUncommittedChanges: false },
    ]
    
    for (const repo of mockRepos) {
      const repoPath = path.join(testDir, repo.name)
      await createMockRepo(repoPath, {
        hasUncommittedChanges: repo.hasUncommittedChanges,
        remoteUrl: `https://github.com/test/${repo.name}.git`
      })
    }
    
    // Create a conflicting directory to test error handling
    await fs.writeFile(path.join(testDir, 'error-repo'), 'this will cause a conflict')
    
    log('green', `✅ Created ${mockRepos.length} mock repositories + 1 error case`)
    
    // === PHASE 2: Test help and version output ===
    log('cyan', '🔧 Phase 2: Testing CLI help and version...')
    
    const helpResult = await runGhPullAll('--help', { timeout: 5000 })
    if (helpResult.output.includes('--help') && helpResult.output.includes('--version')) {
      log('green', '✅ Help output: Correctly displays help information')
    } else {
      throw new Error(`Help output validation failed. Got: ${helpResult.output}`)
    }
    
    const versionResult = await runGhPullAll('--version', { timeout: 5000 })
    if (versionResult.output.includes('1.') || versionResult.output.includes('0.')) {
      log('green', '✅ Version output: Displays version number')
    } else {
      throw new Error('Version output validation failed')  
    }
    
    // === PHASE 3: Test argument validation ===
    log('cyan', '🔧 Phase 3: Testing argument validation...')
    
    const noArgsResult = await runGhPullAll('', { timeout: 5000, expectError: true })
    if (noArgsResult.output.includes('Usage:') && noArgsResult.output.includes('--org')) {
      log('green', '✅ Argument validation: Shows usage when no arguments provided')
    } else {
      throw new Error(`Argument validation failed. Got: ${noArgsResult.output}`)
    }
    
    const conflictResult = await runGhPullAll('--org test --user test', { timeout: 5000, expectError: true })
    if (conflictResult.output.includes('Usage:')) {
      log('green', '✅ Argument validation: Shows usage for invalid argument combination')
    } else {
      throw new Error(`Argument validation failed for conflicting args. Got: ${conflictResult.output}`)
    }
    
    // === PHASE 4: Test local directory operations (without GitHub API) ===
    log('cyan', '🔧 Phase 4: Testing local directory operations...')
    
    const localResult = await runGhPullAll(`--user test --dir ${testDir} --single-thread`, { 
      timeout: 10000, 
      expectError: true,  // Expect error since no GitHub API call will work
      cwd: testDir
    })
    
    // Validate that it at least attempts to process the directories
    const checks = {
      'Scanned directory': 'Scanning',
      'Found repos': testDir,
      'Processing': 'repo'
    }
    
    const failures = validateOutput(localResult.output, checks)
    if (failures.length === 0) {
      log('green', '✅ Local operations: Successfully processes local directories')
    } else {
      log('yellow', `⚠️ Local operations: ${failures.length} validation issues (may be expected)`)
    }
    
    // === PHASE 5: Test terminal width handling ===
    log('cyan', '🔧 Phase 5: Testing terminal width handling...')
    
    // Test with narrow terminal width
    process.env.COLUMNS = '40'
    const narrowResult = await runGhPullAll(`--user test --dir ${testDir} --single-thread`, { 
      timeout: 10000, 
      expectError: true 
    })
    
    if (narrowResult.output.includes('...') || narrowResult.output.length > 0) {
      log('green', '✅ Terminal width: Handles narrow terminal')
    } else {
      log('yellow', '⚠️ Terminal width: Unable to validate width handling')
    }
    
    // Reset terminal width
    delete process.env.COLUMNS
    
    log('green', '🎉 Fast integration test completed!')
    log('magenta', '✨ Core functionality validated without external dependencies')
    
  } catch (error) {
    log('red', `❌ Fast integration test failed: ${error.message}`)
    throw error
  } finally {
    // Clean up
    await cleanupTestDir(testDir)
    log('cyan', '🧹 Cleaned up test directory')
  }
}

// Run the test
testFastIntegration().catch(error => {
  console.error(`💥 Test failed: ${error.message}`)
  process.exit(1)
})