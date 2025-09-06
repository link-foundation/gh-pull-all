#!/usr/bin/env bun

// Unit tests for gh-pull-all components
// Using bun test compatible naming and structure

import { test, expect } from "bun:test"
import { TestEnvironment } from './test-utils.mjs'

// Test argument validation logic (extracted from CLI parsing)
function validateArgs(args) {
  const hasOrg = args.includes('--org') || args.includes('-o')
  const hasUser = args.includes('--user') || args.includes('-u')
  
  if (!hasOrg && !hasUser) {
    throw new Error('You must specify either --org or --user')
  }
  
  if (hasOrg && hasUser) {
    throw new Error('You cannot specify both --org and --user')
  }
  
  // Check thread options
  const threadsIndex = args.findIndex(arg => arg === '--threads' || arg === '-j')
  const hasSingleThread = args.includes('--single-thread')
  
  if (threadsIndex >= 0 && hasSingleThread) {
    throw new Error('Cannot specify both --single-thread and --threads')
  }
  
  if (threadsIndex >= 0 && threadsIndex + 1 < args.length) {
    const threadCount = parseInt(args[threadsIndex + 1])
    if (threadCount < 1) {
      throw new Error('Thread count must be at least 1')
    }
  }
  
  return true
}

// Test directory checking utility
function isValidDirectory(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    return false
  }
  
  // Basic path validation
  if (dirPath.includes('..') && !dirPath.startsWith('/')) {
    return false // Potentially unsafe relative paths
  }
  
  return true
}

// Test concurrency calculation
function calculateConcurrency(threads, singleThread) {
  return singleThread ? 1 : (threads || 8)
}

// Test status message formatting
function formatStatusMessage(repoName, status, error = null) {
  const statusIcons = {
    pending: '⏳',
    cloning: '📦',
    pulling: '📥',
    success: '✅',
    failed: '❌',
    skipped: '⚠️',
    uncommitted: '🔄'
  }
  
  const icon = statusIcons[status] || '?'
  
  if (status === 'failed' && error) {
    // Truncate long error messages for status display
    const maxErrorLength = 50
    const errorMsg = error.length > maxErrorLength 
      ? error.substring(0, maxErrorLength) + '...'
      : error
    
    return `${icon} ${repoName}: ${errorMsg}`
  }
  
  return `${icon} ${repoName}`
}

// Unit tests
test("validateArgs accepts org argument", () => {
  const result = validateArgs(['--org', 'test-org'])
  expect(result).toBe(true)
})

test("validateArgs accepts user argument", () => {
  const result = validateArgs(['--user', 'test-user'])
  expect(result).toBe(true)
})

test("validateArgs rejects missing arguments", () => {
  expect(() => {
    validateArgs([])
  }).toThrow('You must specify either --org or --user')
})

test("validateArgs rejects both org and user", () => {
  expect(() => {
    validateArgs(['--org', 'test-org', '--user', 'test-user'])
  }).toThrow('You cannot specify both --org and --user')
})

test("validateArgs accepts aliases", () => {
  expect(validateArgs(['-o', 'test-org'])).toBe(true)
  expect(validateArgs(['-u', 'test-user'])).toBe(true)
})

test("validateArgs accepts threads option", () => {
  expect(validateArgs(['--user', 'test', '--threads', '4'])).toBe(true)
})

test("validateArgs accepts -j alias for threads", () => {
  expect(validateArgs(['--user', 'test', '-j', '8'])).toBe(true)
})

test("validateArgs rejects conflicting thread options", () => {
  expect(() => {
    validateArgs(['--user', 'test', '--single-thread', '--threads', '4'])
  }).toThrow('Cannot specify both --single-thread and --threads')
})

test("validateArgs rejects invalid thread count", () => {
  expect(() => {
    validateArgs(['--user', 'test', '--threads', '0'])
  }).toThrow('Thread count must be at least 1')
})

test("isValidDirectory validates path strings", () => {
  expect(isValidDirectory('/valid/absolute/path')).toBe(true)
  expect(isValidDirectory('valid/relative/path')).toBe(true)
  expect(isValidDirectory('')).toBe(false)
  expect(isValidDirectory(null)).toBe(false)
  expect(isValidDirectory(undefined)).toBe(false)
  expect(isValidDirectory(123)).toBe(false)
})

test("isValidDirectory rejects potentially unsafe paths", () => {
  expect(isValidDirectory('../potentially/unsafe')).toBe(false)
  expect(isValidDirectory('/absolute/../still/safe')).toBe(true)
})

test("calculateConcurrency handles single thread mode", () => {
  expect(calculateConcurrency(8, true)).toBe(1)
  expect(calculateConcurrency(16, true)).toBe(1)
})

test("calculateConcurrency uses threads when not single thread", () => {
  expect(calculateConcurrency(4, false)).toBe(4)
  expect(calculateConcurrency(8, false)).toBe(8)
})

test("calculateConcurrency defaults to 8", () => {
  expect(calculateConcurrency(undefined, false)).toBe(8)
  expect(calculateConcurrency(null, false)).toBe(8)
})

test("formatStatusMessage handles different statuses", () => {
  expect(formatStatusMessage('repo1', 'success')).toBe('✅ repo1')
  expect(formatStatusMessage('repo2', 'pending')).toBe('⏳ repo2')
  expect(formatStatusMessage('repo3', 'failed')).toBe('❌ repo3')
})

test("formatStatusMessage truncates long error messages", () => {
  const longError = 'This is a very long error message that should be truncated for status display'
  const result = formatStatusMessage('repo', 'failed', longError)
  
  expect(result).toContain('❌ repo:')
  expect(result).toContain('...')
  expect(result.length).toBeLessThan(80) // Should be reasonable length
})

test("formatStatusMessage preserves short error messages", () => {
  const shortError = 'Short error'
  const result = formatStatusMessage('repo', 'failed', shortError)
  
  expect(result).toBe('❌ repo: Short error')
})

// Integration-style test using TestEnvironment
test("TestEnvironment creates and cleans up temp directories", async () => {
  const env = new TestEnvironment('unit-test-')
  
  const tempDir = await env.setup()
  expect(typeof tempDir).toBe('string')
  expect(tempDir).toContain('unit-test-')
  
  // Test cleanup doesn't throw
  let error = null
  try {
    await env.teardown()
  } catch (e) {
    error = e
  }
  expect(error).toBeNull()
})