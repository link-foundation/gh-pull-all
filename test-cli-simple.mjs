#!/usr/bin/env bun

// Simple CLI validation test without yargs interference
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')

// Test basic argument parsing logic
function validateArgs(args) {
  const hasOrg = args.includes('--org') || args.includes('-o')
  const hasUser = args.includes('--user') || args.includes('-u')
  
  if (!hasOrg && !hasUser) {
    throw new Error('You must specify either --org or --user')
  }
  
  if (hasOrg && hasUser) {
    throw new Error('You cannot specify both --org and --user')
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
    assert.match(error.message, /You must specify either --org or --user/)
  }
})

test('validateArgs should reject both org and user', () => {
  try {
    validateArgs(['--org', 'test-org', '--user', 'test-user'])
    assert.unreachable('Should have thrown validation error')
  } catch (error) {
    assert.match(error.message, /You cannot specify both --org and --user/)
  }
})

test('validateArgs should accept aliases', () => {
  const result1 = validateArgs(['-o', 'test-org'])
  const result2 = validateArgs(['-u', 'test-user'])
  assert.ok(result1)
  assert.ok(result2)
})

test.run()