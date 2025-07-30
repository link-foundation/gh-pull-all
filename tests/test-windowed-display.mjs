#!/usr/bin/env bun

import { execSync } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Create test directory with many repos in OS temp directory
const testDir = join(tmpdir(), 'pull-all-test-windowed-display')
console.log(`Creating test directory with 50 repositories...`)

try {
  rmSync(testDir, { recursive: true, force: true })
} catch {}

mkdirSync(testDir, { recursive: true })

// Create 50 test repositories
for (let i = 1; i <= 50; i++) {
  const repoName = `test-repo-${String(i).padStart(2, '0')}`
  const repoPath = join(testDir, repoName)
  
  mkdirSync(repoPath)
  execSync('git init', { cwd: repoPath, stdio: 'ignore' })
  execSync('git remote add origin https://github.com/example/repo.git', { cwd: repoPath, stdio: 'ignore' })
  execSync('echo "# Test" > README.md', { cwd: repoPath, shell: true })
  execSync('git add .', { cwd: repoPath, stdio: 'ignore' })
  execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'ignore' })
}

console.log(`Created 50 test repositories in ${testDir}`)
console.log(`\nNow run: ../pull-all.mjs ${testDir} --threads 10`)
console.log(`\nThe display will show only 10 repositories at a time (or terminal height, whichever is smaller)`)
console.log(`and will cycle through all 50 repositories over time.`)

// Cleanup
console.log(`\nCleaning up test directory...`)
try {
  rmSync(testDir, { recursive: true, force: true })
  console.log('✅ Test directory cleaned up successfully')
} catch (error) {
  console.error('❌ Failed to cleanup test directory:', error.message)
}