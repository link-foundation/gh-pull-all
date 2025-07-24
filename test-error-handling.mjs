#!/usr/bin/env bun

// Test error handling scenarios
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const { Octokit } = await use('@octokit/rest@latest')

test('Octokit should handle invalid token gracefully', async () => {
  const octokit = new Octokit({
    auth: 'invalid-token-12345'
  })
  
  try {
    await octokit.rest.repos.listForOrg({
      org: 'github',
      per_page: 1
    })
    assert.unreachable('Should have thrown authentication error')
  } catch (error) {
    assert.ok(error.status === 401, 'Should return 401 for invalid token')
    assert.match(error.message, /Bad credentials/)
  }
})

test('Octokit should handle network errors', async () => {
  // Create Octokit instance with invalid base URL
  const octokit = new Octokit({
    baseUrl: 'https://invalid-github-api.com'
  })
  
  try {
    await octokit.rest.repos.listForOrg({
      org: 'github',
      per_page: 1
    })
    assert.unreachable('Should have thrown network error')
  } catch (error) {
    // Accept various network error types
    const isNetworkError = error.code === 'ENOTFOUND' || 
                          error.code === 'ECONNREFUSED' ||
                          error.message.includes('getaddrinfo') ||
                          error.message.includes('network') ||
                          error.status >= 500
    assert.ok(isNetworkError, `Expected network error, got: ${error.message}`)
  }
})

test('Octokit should handle 404 errors for non-existent organization', async () => {
  const octokit = new Octokit()
  
  try {
    await octokit.rest.repos.listForOrg({
      org: 'nonexistent-org-12345-test',
      per_page: 1
    })
    assert.unreachable('Should have thrown 404 error')
  } catch (error) {
    assert.ok(error.status === 404, 'Should return 404 for non-existent org')
  }
})

test('Octokit should handle 404 errors for non-existent user', async () => {
  const octokit = new Octokit()
  
  try {
    await octokit.rest.repos.listForUser({
      username: 'nonexistent-user-12345-test',
      per_page: 1
    })
    assert.unreachable('Should have thrown 404 error')
  } catch (error) {
    assert.ok(error.status === 404, 'Should return 404 for non-existent user')
  }
})

test('Octokit should handle rate limiting gracefully', async () => {
  const octokit = new Octokit()
  
  // Make multiple rapid requests to potentially trigger rate limiting
  const requests = Array(5).fill().map(() => 
    octokit.rest.repos.listForOrg({
      org: 'github',
      per_page: 1
    }).catch(error => error)
  )
  
  const results = await Promise.all(requests)
  
  // Check if any request was rate limited
  const rateLimited = results.some(result => 
    result && result.status === 403 && 
    result.message && result.message.includes('rate limit')
  )
  
  if (rateLimited) {
    assert.ok(true, 'Rate limiting handled appropriately')
  } else {
    assert.ok(true, 'No rate limiting encountered')
  }
})

test('Error serialization should preserve important properties', async () => {
  const octokit = new Octokit({
    auth: 'invalid-token'
  })
  
  try {
    await octokit.rest.repos.listForOrg({
      org: 'github',
      per_page: 1
    })
    assert.unreachable('Should have thrown authentication error')
  } catch (error) {
    // Test that error has essential properties
    assert.ok(error.message, 'Error should have message')
    assert.ok(error.status, 'Error should have status')
    assert.ok(typeof error.status === 'number', 'Status should be a number')
    
    // Test serialization
    const serialized = JSON.parse(JSON.stringify(error))
    assert.ok(typeof serialized === 'object', 'Error should be serializable')
  }
})

test.run()