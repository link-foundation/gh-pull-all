#!/usr/bin/env bun

// Common test utilities for gh-pull-all tests
// This file provides shared functionality to reduce code duplication

const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());
const { spawn } = await import('child_process')
import { promises as fs } from 'fs'
import path from 'path'
import { tmpdir } from 'os'

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

// Runtime detection for cross-compatibility
export function detectRuntime() {
  // Check if we're running under bun
  if (typeof Bun !== 'undefined') {
    return 'bun'
  }
  // Otherwise assume Node.js
  return 'node'
}

// Cross-compatible script execution
export function runScript(args, options = {}) {
  return new Promise((resolve, reject) => {
    // Try to use the same runtime that's running this test
    const runtime = detectRuntime()
    const scriptPath = path.resolve('../gh-pull-all.mjs')
    
    // For better compatibility, use node directly since it works reliably
    const child = spawn('node', [scriptPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      ...options
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, runtime })
    })
    
    child.on('error', (error) => {
      reject(error)
    })
  })
}

// Create a temporary directory for tests
export async function createTempDir(prefix = 'gh-pull-all-test-') {
  const tempPath = path.join(tmpdir(), prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 9))
  await fs.mkdir(tempPath, { recursive: true })
  return tempPath
}

// Clean up temporary directory
export async function cleanupTempDir(tempPath) {
  try {
    await fs.rm(tempPath, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
    console.warn(`Failed to cleanup temp dir ${tempPath}: ${error.message}`)
  }
}

// Common test setup and teardown
export class TestEnvironment {
  constructor(prefix = 'gh-pull-all-test-') {
    this.prefix = prefix
    this.tempDir = null
    this.cleanup = []
  }
  
  async setup() {
    this.tempDir = await createTempDir(this.prefix)
    return this.tempDir
  }
  
  async teardown() {
    if (this.tempDir) {
      await cleanupTempDir(this.tempDir)
    }
    // Run any additional cleanup tasks
    for (const cleanupTask of this.cleanup) {
      try {
        await cleanupTask()
      } catch (error) {
        console.warn(`Cleanup task failed: ${error.message}`)
      }
    }
    this.cleanup = []
  }
  
  addCleanup(task) {
    this.cleanup.push(task)
  }
}

// Mock GitHub API responses for testing
export const mockGitHubAPI = {
  // Mock user repos response
  userRepos: (username, repos = []) => ({
    data: repos.map(repo => ({
      name: repo.name || `${username}-repo-${Math.random().toString(36).substr(2, 5)}`,
      clone_url: repo.clone_url || `https://github.com/${username}/${repo.name || 'repo'}.git`,
      ssh_url: repo.ssh_url || `git@github.com:${username}/${repo.name || 'repo'}.git`,
      private: repo.private || false,
      archived: repo.archived || false,
      ...repo
    }))
  }),
  
  // Mock org repos response
  orgRepos: (orgname, repos = []) => ({
    data: repos.map(repo => ({
      name: repo.name || `${orgname}-repo-${Math.random().toString(36).substr(2, 5)}`,
      clone_url: repo.clone_url || `https://github.com/${orgname}/${repo.name || 'repo'}.git`,
      ssh_url: repo.ssh_url || `git@github.com:${orgname}/${repo.name || 'repo'}.git`,
      private: repo.private || false,
      archived: repo.archived || false,
      ...repo
    }))
  })
}

// Common test assertions
export function assertNoAnsiCursorCodes(output) {
  // Should not contain ANSI cursor movement codes
  if (output.match(/\x1b\[\d+A/)) {
    throw new Error('Output contains ANSI cursor up codes')
  }
  if (output.match(/\x1b\[2K/)) {
    throw new Error('Output contains ANSI line clearing codes')  
  }
}

export function assertContainsAll(output, patterns) {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (!output.includes(pattern)) {
        throw new Error(`Output does not contain: "${pattern}"`)
      }
    } else if (pattern instanceof RegExp) {
      if (!pattern.test(output)) {
        throw new Error(`Output does not match pattern: ${pattern}`)
      }
    }
  }
}

// Performance measurement utilities
export class PerformanceTimer {
  constructor(name = 'Timer') {
    this.name = name
    this.startTime = null
    this.endTime = null
  }
  
  start() {
    this.startTime = Date.now()
    return this
  }
  
  end() {
    this.endTime = Date.now()
    return this
  }
  
  duration() {
    if (!this.startTime || !this.endTime) {
      throw new Error('Timer not properly started/ended')
    }
    return this.endTime - this.startTime
  }
  
  durationSeconds() {
    return (this.duration() / 1000).toFixed(1)
  }
  
  log() {
    log('dim', `${this.name}: ${this.durationSeconds()}s`)
  }
}