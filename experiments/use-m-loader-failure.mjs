#!/usr/bin/env bun

// Demonstrates the fix for https://github.com/link-foundation/gh-pull-all/issues/35.
//
// BEFORE: when a CDN returned an error body, the bootstrap crashed with a
// cryptic `SyntaxError: Unexpected identifier 'Server'`. AFTER: loadUseM()
// reports a clear, actionable error after exhausting the CDN mirrors.

import { loadUseM } from '../load-use-m.mjs'

console.log('--- BEFORE (naive bootstrap) ---')
try {
  // This is exactly what the old code did with the CDN error body.
  eval('Internal Server Error')
} catch (error) {
  console.log(`${error.constructor.name}: ${error.message}`)
}

console.log('\n--- AFTER (robust loadUseM) ---')
const badFetch = async (url) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => 'Internal Server Error',
})
try {
  await loadUseM({
    fetch: badFetch,
    sources: ['https://unpkg.com/use-m/use.js', 'https://cdn.jsdelivr.net/npm/use-m/use.js'],
    maxAttemptsPerSource: 2,
    retryDelayMs: 0,
  })
} catch (error) {
  console.log(`${error.constructor.name}: ${error.message}`)
}
