#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import simple-git using use-m
const { default: git } = await use('simple-git@3.28.0')

async function testMerge() {
  const targetDir = process.argv[2] || '.'
  
  console.log('Testing merge result in:', targetDir)
  console.log('=' .repeat(60))
  
  try {
    const simpleGit = git(targetDir)
    
    // Get current branch
    const currentBranch = await simpleGit.revparse(['--abbrev-ref', 'HEAD'])
    console.log('Current branch:', currentBranch.trim())
    
    // Get default branch
    const remoteInfo = await simpleGit.remote(['show', 'origin'])
    const defaultBranchMatch = remoteInfo.match(/HEAD branch:\s*(.+)/)
    const defaultBranch = defaultBranchMatch ? defaultBranchMatch[1].trim() : 'main'
    console.log('Default branch:', defaultBranch)
    
    // Fetch latest
    console.log('\nFetching latest from origin...')
    await simpleGit.fetch()
    
    // Try to merge
    const remoteBranch = `origin/${defaultBranch}`
    console.log(`\nAttempting to merge ${remoteBranch}...`)
    
    try {
      const result = await simpleGit.merge([remoteBranch])
      
      console.log('\n--- Raw merge result ---')
      console.log('Type:', typeof result)
      console.log('Full result:', JSON.stringify(result, null, 2))
      
      // Check different properties
      console.log('\n--- Parsed properties ---')
      console.log('result.files:', result?.files)
      console.log('result.insertions:', result?.insertions)
      console.log('result.deletions:', result?.deletions) 
      console.log('result.changes:', result?.changes)
      console.log('result.summary:', result?.summary)
      console.log('result.result:', result?.result)
      
      // Check for changes
      const hasChanges = result?.files?.length > 0 || 
                        result?.insertions > 0 || 
                        result?.deletions > 0 ||
                        result?.changes > 0
      
      console.log('\n--- Analysis ---')
      console.log('Has changes:', hasChanges)
      
      // Check text output
      const resultText = String(result?.summary || result?.result || result || '')
      console.log('Result as string:', resultText)
      console.log('Contains "already up to date":', resultText.toLowerCase().includes('already up to date'))
      console.log('Contains "already up-to-date":', resultText.toLowerCase().includes('already up-to-date'))
      
    } catch (mergeError) {
      console.log('\nMerge error:', mergeError.message)
    }
    
    // Check git status after merge
    console.log('\n--- Git status after merge ---')
    const status = await simpleGit.status()
    console.log('Modified files:', status.modified.length)
    console.log('Ahead:', status.ahead)
    console.log('Behind:', status.behind)
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testMerge()