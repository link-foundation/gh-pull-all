#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import simple-git using use-m
const { default: git } = await use('simple-git@3.28.0')

async function testSingleRepo() {
  const targetDir = process.argv[2] || '.'
  
  console.log('Testing in:', targetDir)
  
  try {
    const simpleGit = git(targetDir)
    
    // Get current branch
    const currentBranch = await simpleGit.revparse(['--abbrev-ref', 'HEAD'])
    const currentBranchName = currentBranch.trim()
    console.log('Current branch:', currentBranchName)
    
    // Get default branch
    const remoteInfo = await simpleGit.remote(['show', 'origin'])
    const defaultBranchMatch = remoteInfo.match(/HEAD branch:\s*(.+)/)
    const defaultBranch = defaultBranchMatch ? defaultBranchMatch[1].trim() : 'main'
    console.log('Default branch:', defaultBranch)
    
    if (currentBranchName !== defaultBranch) {
      // Fetch latest
      console.log('Fetching latest...')
      await simpleGit.fetch()
      
      const remoteBranch = `origin/${defaultBranch}`
      console.log(`Merging ${remoteBranch}...`)
      
      const result = await simpleGit.merge([remoteBranch])
      
      // Check using the updated logic
      const hasChanges = (result?.files?.length > 0) || 
                        (result?.summary?.changes > 0) || 
                        (result?.summary?.insertions > 0) || 
                        (result?.summary?.deletions > 0)
      
      const isAlreadyUpToDate = !hasChanges
      
      if (isAlreadyUpToDate) {
        console.log(`✅ Already up to date with ${defaultBranch}`)
      } else {
        console.log(`✅ Successfully merged ${defaultBranch} into ${currentBranchName}`)
        console.log(`   Changes: ${result.summary.changes} (${result.summary.insertions} insertions, ${result.summary.deletions} deletions)`)
      }
    } else {
      console.log('Already on default branch')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testSingleRepo()