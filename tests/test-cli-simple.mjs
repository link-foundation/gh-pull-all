#!/usr/bin/env bun

// Simple CLI validation test without yargs interference
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')

// Test basic argument parsing logic
function validateArgs(args) {
  const hasOrg = args.includes('--org') || args.includes('-o')
  const hasUser = args.includes('--user') || args.includes('-u')
  const hasAuto = args.includes('--auto') || args.includes('-a')
  
  if (!hasOrg && !hasUser && !hasAuto) {
    throw new Error('You must specify either --org, --user, or --auto')
  }
  
  if ((hasOrg && hasUser) || (hasOrg && hasAuto) || (hasUser && hasAuto)) {
    throw new Error('You can only specify one of --org, --user, or --auto')
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

test('validateArgs should accept org argument', () => {
  const result = validateArgs(['--org', 'test-org'])
  assert.ok(result)
})

test('validateArgs should accept user argument', () => {
  const result = validateArgs(['--user', 'test-user'])
  assert.ok(result)
})

test('validateArgs should reject missing arguments', () => {
  try {
    validateArgs([])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You must specify either --org, --user, or --auto/)
  }
})

test('validateArgs should reject both org and user', () => {
  try {
    validateArgs(['--org', 'test-org', '--user', 'test-user'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You can only specify one of --org, --user, or --auto/)
  }
})

test('validateArgs should accept aliases', () => {
  const result1 = validateArgs(['-o', 'test-org'])
  const result2 = validateArgs(['-u', 'test-user'])
  const result3 = validateArgs(['-a'])
  assert.ok(result1)
  assert.ok(result2)
  assert.ok(result3)
})

test('validateArgs should accept threads option', () => {
  const result = validateArgs(['--user', 'test-user', '--threads', '4'])
  assert.ok(result)
})

test('validateArgs should accept -j alias for threads', () => {
  const result = validateArgs(['--user', 'test-user', '-j', '8'])
  assert.ok(result)
})

test('validateArgs should accept single-thread option', () => {
  const result = validateArgs(['--user', 'test-user', '--single-thread'])
  assert.ok(result)
})

test('validateArgs should reject both single-thread and threads', () => {
  try {
    validateArgs(['--user', 'test-user', '--single-thread', '--threads', '4'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /Cannot specify both --single-thread and --threads/)
  }
})

test('validateArgs should reject threads less than 1', () => {
  try {
    validateArgs(['--user', 'test-user', '--threads', '0'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /Thread count must be at least 1/)
  }
})

test('validateArgs should accept live-updates option', () => {
  const result1 = validateArgs(['--user', 'test-user', '--live-updates'])
  const result2 = validateArgs(['--user', 'test-user', '--no-live-updates'])
  assert.ok(result1)
  assert.ok(result2)
})

test('validateArgs should accept auto flag', () => {
  const result = validateArgs(['--auto'])
  assert.ok(result)
})

test('validateArgs should reject auto with org', () => {
  try {
    validateArgs(['--auto', '--org', 'test-org'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You can only specify one of --org, --user, or --auto/)
  }
})

test('validateArgs should reject auto with user', () => {
  try {
    validateArgs(['--auto', '--user', 'test-user'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You can only specify one of --org, --user, or --auto/)
  }
})

test('validateArgs should reject all three flags', () => {
  try {
    validateArgs(['--auto', '--org', 'test-org', '--user', 'test-user'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You can only specify one of --org, --user, or --auto/)
  }
})

test.run()