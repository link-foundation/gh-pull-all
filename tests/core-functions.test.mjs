#!/usr/bin/env bun

// Unit tests for core functions using bun test naming convention
import { describe, test, expect } from 'bun:test'
import { createTestDir, cleanupTestDir, validateOutput } from './common-test-utils.mjs'

describe('Common Test Utils', () => {
  test('createTestDir creates unique directory names', () => {
    const dir1 = createTestDir('test1')
    const dir2 = createTestDir('test1')
    
    expect(dir1).toContain('gh-pull-all-test-test1')
    expect(dir2).toContain('gh-pull-all-test-test1')
    expect(dir1).not.toBe(dir2) // Should be unique
  })

  test('validateOutput correctly identifies matching patterns', () => {
    const output = 'This is a test output with version 1.4.0 and --help flag'
    
    const checks = {
      'version': '1.4.0',
      'help flag': '--help',
      'test word': /test/,
      'missing': 'nonexistent'
    }
    
    const failures = validateOutput(output, checks)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('Missing: missing')
  })
  
  test('validateOutput handles regex patterns', () => {
    const output = 'Error #1: Something failed\nError #2: Another issue'
    
    const checks = {
      'error numbers': /Error #\d+:/g,
      'numeric pattern': /\d+/
    }
    
    const failures = validateOutput(output, checks)
    expect(failures).toHaveLength(0)
  })
})

// Mock CLI argument validation logic (extracted from actual script)
function validateCliArgs(args) {
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
    if (isNaN(threadCount) || threadCount < 1) {
      throw new Error('Thread count must be a positive number')
    }
  }
  
  return true
}

describe('CLI Argument Validation', () => {
  test('accepts valid org argument', () => {
    expect(() => validateCliArgs(['--org', 'test-org'])).not.toThrow()
  })
  
  test('accepts valid user argument', () => {
    expect(() => validateCliArgs(['--user', 'test-user'])).not.toThrow()
  })
  
  test('rejects missing org and user', () => {
    expect(() => validateCliArgs([])).toThrow('You must specify either --org or --user')
  })
  
  test('rejects both org and user', () => {
    expect(() => validateCliArgs(['--org', 'test', '--user', 'test'])).toThrow('You cannot specify both --org and --user')
  })
  
  test('accepts thread count', () => {
    expect(() => validateCliArgs(['--org', 'test', '--threads', '4'])).not.toThrow()
  })
  
  test('rejects invalid thread count', () => {
    expect(() => validateCliArgs(['--org', 'test', '--threads', '0'])).toThrow('Thread count must be a positive number')
    expect(() => validateCliArgs(['--org', 'test', '--threads', 'invalid'])).toThrow('Thread count must be a positive number')
  })
  
  test('rejects conflicting thread options', () => {
    expect(() => validateCliArgs(['--org', 'test', '--single-thread', '--threads', '4'])).toThrow('Cannot specify both --single-thread and --threads')
  })
})

// Mock terminal width handling
function handleTerminalWidth(message, maxWidth = 80) {
  if (message.length <= maxWidth) {
    return message
  }
  return message.substring(0, maxWidth - 3) + '...'
}

describe('Terminal Width Handling', () => {
  test('returns message unchanged if under width limit', () => {
    const message = 'Short message'
    expect(handleTerminalWidth(message, 80)).toBe(message)
  })
  
  test('truncates long messages with ellipsis', () => {
    const message = 'This is a very long message that exceeds the terminal width limit'
    const result = handleTerminalWidth(message, 20)
    expect(result).toBe('This is a very lo...')
    expect(result).toHaveLength(20)
  })
  
  test('handles edge case of exact width', () => {
    const message = 'Exact'
    const result = handleTerminalWidth(message, 5)
    expect(result).toBe('Exact')
  })
})