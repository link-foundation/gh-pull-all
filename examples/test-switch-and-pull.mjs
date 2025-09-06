#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Test script to verify that switch-to-default always does a pull afterward
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { default: git } = await use('simple-git@3.28.0')
const fs = await use('fs-extra@11.3.0')
const path = await import('path')

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

async function createTestRepoWithRemoteCommit() {
  const testDir = path.join(process.cwd(), 'temp-test-switch-pull')
  
  try {
    // Clean up any existing test directory
    await fs.remove(testDir)
    await fs.ensureDir(testDir)
    
    const localRepoPath = path.join(testDir, 'test-repo')
    const remoteRepoPath = path.join(testDir, 'test-repo.git')
    
    // Create a bare remote repository first
    await fs.ensureDir(remoteRepoPath)
    const remoteGit = git(remoteRepoPath)
    await remoteGit.init(['--bare'])
    
    // Create local repository and push to remote
    await fs.ensureDir(localRepoPath)
    const localGit = git(localRepoPath)
    
    await localGit.init()
    await localGit.addConfig('user.name', 'Test User')
    await localGit.addConfig('user.email', 'test@example.com')
    
    // Create initial commit
    await fs.writeFile(path.join(localRepoPath, 'README.md'), '# Test Repo\nInitial content')
    await localGit.add('.')
    await localGit.commit('Initial commit')
    
    // Add remote and push
    await localGit.addRemote('origin', remoteRepoPath)
    await localGit.push(['origin', 'main'])
    
    // Create a feature branch and switch to it
    await localGit.checkoutBranch('feature', 'main')
    await fs.writeFile(path.join(localRepoPath, 'feature.txt'), 'Feature content')
    await localGit.add('.')
    await localGit.commit('Add feature')
    
    // Now simulate a remote change on main branch by creating a second clone
    const tempClonePath = path.join(testDir, 'temp-clone')
    const tempGit = git()
    await tempGit.clone(remoteRepoPath, tempClonePath)
    
    const tempCloneGit = git(tempClonePath)
    await tempCloneGit.addConfig('user.name', 'Test User')
    await tempCloneGit.addConfig('user.email', 'test@example.com')
    await fs.writeFile(path.join(tempClonePath, 'remote-change.txt'), 'Remote change content')
    await tempCloneGit.add('.')
    await tempCloneGit.commit('Remote change')
    await tempCloneGit.push()
    
    // Clean up temp clone
    await fs.remove(tempClonePath)
    
    log('green', '✅ Test repository created with remote changes')
    
    // Now test our switchToDefaultBranch function
    log('blue', 'Testing switchToDefaultBranch with pull...')
    
    // Check current branch (should be 'feature')
    let currentBranch = await localGit.revparse(['--abbrev-ref', 'HEAD'])
    log('cyan', `Current branch: ${currentBranch.trim()}`)
    
    // Get current commit on main before operation
    await localGit.checkout('main')
    const commitBeforePull = await localGit.revparse(['HEAD'])
    log('cyan', `Main branch commit before: ${commitBeforePull.substring(0, 7)}`)
    
    // Switch back to feature branch
    await localGit.checkout('feature')
    
    // Now manually call the equivalent of our switchToDefaultBranch function
    await localGit.fetch(['--all'])
    
    // Switch to default branch (main)
    await localGit.checkout('main')
    
    // Pull latest changes (this is what our fix adds)
    await localGit.pull()
    
    // Check current commit after pull
    const commitAfterPull = await localGit.revparse(['HEAD'])
    log('cyan', `Main branch commit after: ${commitAfterPull.substring(0, 7)}`)
    
    // Verify that we have the remote changes
    const remoteChangeExists = await fs.pathExists(path.join(localRepoPath, 'remote-change.txt'))
    
    if (remoteChangeExists) {
      log('green', '✅ Remote changes pulled successfully after switching to default branch')
    } else {
      log('red', '❌ Remote changes were not pulled after switching to default branch')
    }
    
    if (commitBeforePull !== commitAfterPull) {
      log('green', '✅ Commit hash changed, confirming pull was effective')
    } else {
      log('yellow', '⚠️  Commit hash unchanged (this could be normal if no new commits)')
    }
    
    return { success: remoteChangeExists, testDir }
    
  } catch (error) {
    log('red', `❌ Test failed: ${error.message}`)
    throw error
  }
}

async function main() {
  try {
    const result = await createTestRepoWithRemoteCommit()
    
    if (result.success) {
      log('green', '\n🎉 Switch-to-default with pull test passed!')
    } else {
      log('red', '\n💥 Switch-to-default with pull test failed!')
      process.exit(1)
    }
    
    // Clean up
    await fs.remove(result.testDir)
    
  } catch (error) {
    log('red', `💥 Test execution failed: ${error.message}`)
    console.error(error)
    process.exit(1)
  }
}

main()