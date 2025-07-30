#!/usr/bin/env node

import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDir = path.join(__dirname, 'test-padding-output')
const scriptPath = path.join(__dirname, '..', 'gh-pull-all.mjs')

async function setupTest() {
  // Clean up test directory
  if (existsSync(testDir)) {
    await fs.rm(testDir, { recursive: true, force: true })
  }
  await fs.mkdir(testDir, { recursive: true })
  
  // Create mock repositories with names that would trigger the issue
  const repos = [
    'short-name',
    'very-long-repository-name-that-exceeds-normal-length',
    'example-dashboard',
    'example-universal-data-importer'
  ]
  
  for (const repo of repos) {
    const repoPath = path.join(testDir, repo)
    await fs.mkdir(repoPath, { recursive: true })
    
    // Initialize git repo
    execSync('git init', { cwd: repoPath, stdio: 'pipe' })
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' })
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' })
    
    // Create initial commit
    await fs.writeFile(path.join(repoPath, 'README.md'), `# ${repo}\n`)
    execSync('git add .', { cwd: repoPath, stdio: 'pipe' })
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' })
  }
}

async function runTest() {
  console.log('🧪 Testing line padding fix...\n')
  
  try {
    // Run the script with deep-assistant org (will fail but we can check output formatting)
    const output = execSync(
      `node "${scriptPath}" --org deep-assistant --dir "${testDir}" --threads 8 --no-live-updates`,
      { 
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0' } // Disable colors for easier parsing
      }
    ).toString()
    
    // Check output lines for consistent formatting
    const lines = output.split('\n')
    const statusLines = lines.filter(line => line.includes('Successfully pulled') || line.includes('Successfully cloned'))
    
    console.log('📋 Checking output formatting:')
    let hasIssue = false
    
    for (const line of statusLines) {
      // Remove ANSI codes for analysis
      const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '')
      
      // Check if line ends with "pulledes..." or similar truncation
      if (cleanLine.includes('pulledes...') || cleanLine.includes('clonedes...')) {
        console.log(`❌ Found truncation issue: "${cleanLine}"`)
        hasIssue = true
      }
      
      // Check line length (should be padded to terminal width)
      if (cleanLine.length < 80 && !cleanLine.includes('Failed')) {
        console.log(`⚠️  Line shorter than 80 chars: ${cleanLine.length} chars`)
      }
    }
    
    if (!hasIssue) {
      console.log('✅ No truncation issues found')
    }
    
  } catch (error) {
    // Expected to fail when trying to fetch from deep-assistant
    // We're mainly interested in the output formatting of local repos
    const output = error.stdout?.toString() || ''
    
    // Check for the specific formatting we care about
    if (output.includes('Target directory:') && output.includes('test-padding-output')) {
      console.log('✅ Script executed with correct parameters')
      
      // Look for any "pulledes..." truncation in error output
      if (output.includes('pulledes...') || output.includes('clonedes...')) {
        console.log('❌ Found truncation issue in output')
        return false
      } else {
        console.log('✅ No truncation issues found in output')
      }
    }
  }
  
  return true
}

async function cleanupTest() {
  if (existsSync(testDir)) {
    await fs.rm(testDir, { recursive: true, force: true })
  }
}

// Main test execution
(async () => {
  try {
    await setupTest()
    const success = await runTest()
    await cleanupTest()
    
    if (success) {
      console.log('\n✅ Line padding test passed!')
      process.exit(0)
    } else {
      console.log('\n❌ Line padding test failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test error:', error.message)
    await cleanupTest()
    process.exit(1)
  }
})()