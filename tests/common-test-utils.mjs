#!/usr/bin/env bun

// Common utilities for tests to reduce duplication and improve speed
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// Download use-m dynamically - cached for reuse
let useM = null
async function getUseM() {
  if (!useM) {
    const response = await fetch('https://unpkg.com/use-m/use.js')
    const code = await response.text()
    useM = eval(code).use
  }
  return useM
}

// Colors for console output
export const colors = {
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

export const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

// Create unique test directory in tmpdir
export function createTestDir(testName) {
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(7)
  return path.join(os.tmpdir(), `gh-pull-all-test-${testName}-${timestamp}-${randomId}`)
}

// Clean up test directory
export async function cleanupTestDir(testDir) {
  try {
    await fs.rm(testDir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Create a mock git repository for testing
export async function createMockRepo(repoDir, options = {}) {
  const {
    hasUncommittedChanges = false,
    remoteUrl = 'https://github.com/test/repo.git',
    currentBranch = 'main'
  } = options

  await fs.mkdir(repoDir, { recursive: true })
  
  // Initialize git repo
  const { execSync } = await import('child_process')
  
  try {
    execSync('git init', { cwd: repoDir, stdio: 'pipe' })
    execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'pipe' })
    execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'pipe' })
    
    // Create initial commit
    await fs.writeFile(path.join(repoDir, 'README.md'), '# Test Repository')
    execSync('git add .', { cwd: repoDir, stdio: 'pipe' })
    execSync('git commit -m "Initial commit"', { cwd: repoDir, stdio: 'pipe' })
    
    // Add remote
    execSync(`git remote add origin ${remoteUrl}`, { cwd: repoDir, stdio: 'pipe' })
    
    // Create branch if not main
    if (currentBranch !== 'main') {
      execSync(`git checkout -b ${currentBranch}`, { cwd: repoDir, stdio: 'pipe' })
    }
    
    // Add uncommitted changes if requested
    if (hasUncommittedChanges) {
      await fs.writeFile(path.join(repoDir, 'uncommitted.txt'), 'uncommitted changes')
    }
    
    return true
  } catch (error) {
    return false
  }
}

// Get testing utilities with caching
let testUtils = null
export async function getTestUtils() {
  if (!testUtils) {
    const use = await getUseM()
    const { test } = await use('uvu@0.5.6')
    const assert = await use('uvu@0.5.6/assert')
    testUtils = { test, assert }
  }
  return testUtils
}

// Run gh-pull-all with timeout and error handling
export async function runGhPullAll(args, options = {}) {
  const { 
    timeout = 10000, 
    expectError = false,
    cwd = process.cwd() 
  } = options
  
  const { execSync } = await import('child_process')
  
  try {
    const result = execSync(`../gh-pull-all.mjs ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd,
      timeout
    })
    return { success: true, output: result, error: null }
  } catch (error) {
    // Capture both stdout and stderr
    const output = (error.stdout || '') + (error.stderr || '')
    if (expectError) {
      return { success: false, output, error: error.message }
    }
    throw error
  }
}

// Validate common test outputs
export function validateOutput(output, checks) {
  const failures = []
  
  for (const [checkName, pattern] of Object.entries(checks)) {
    if (typeof pattern === 'string') {
      if (!output.includes(pattern)) {
        failures.push(`Missing: ${checkName} (${pattern})`)
      }
    } else if (pattern instanceof RegExp) {
      if (!pattern.test(output)) {
        failures.push(`Missing: ${checkName} (${pattern})`)
      }
    }
  }
  
  return failures
}