#!/usr/bin/env bun

// Regression test for https://github.com/link-foundation/gh-pull-all/issues/35
//
// Loading use-m via `eval(await (await fetch(url)).text())` crashed with a
// cryptic `SyntaxError: Unexpected identifier 'Server'` whenever a CDN returned
// an error body (e.g. the plain text "Internal Server Error") instead of the
// module source. loadUseM() must instead validate responses, fall back across
// CDN mirrors and fail with a clear, actionable message.

import { loadUseM, looksLikeUseModule } from '../load-use-m.mjs'

const { use } = await loadUseM()
const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')

// A minimal stand-in for the real use-m module: evaluating it yields an object
// exposing a `use` function, exactly like the real `use.js`.
const FAKE_USE_M_SOURCE = '({ use: function use() { return "loaded" } })'

// Build a fake fetch that returns scripted responses per call.
function makeFetch(responses) {
  let call = 0
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const response = responses[Math.min(call, responses.length - 1)]
    call++
    if (response.throw) throw new Error(response.throw)
    return {
      ok: response.ok !== false,
      status: response.status ?? 200,
      statusText: response.statusText ?? 'OK',
      text: async () => response.body ?? '',
    }
  }
  fetchImpl.calls = calls
  return fetchImpl
}

// --- Documents the original bug -------------------------------------------

test('eval of an error body reproduces the cryptic SyntaxError', () => {
  try {
    eval('Internal Server Error')
    assert.unreachable('eval should have thrown a SyntaxError')
  } catch (error) {
    assert.instance(error, SyntaxError)
    assert.match(error.message, /Server/)
  }
})

// --- looksLikeUseModule heuristic ------------------------------------------

test('looksLikeUseModule rejects CDN error bodies and pages', () => {
  assert.not.ok(looksLikeUseModule('Internal Server Error'))
  assert.not.ok(looksLikeUseModule('Bad Gateway'))
  assert.not.ok(looksLikeUseModule('Service Unavailable'))
  assert.not.ok(looksLikeUseModule('Not Found'))
  assert.not.ok(looksLikeUseModule('<!DOCTYPE html><html><body>502</body></html>'))
  assert.not.ok(looksLikeUseModule(''))
  assert.not.ok(looksLikeUseModule('   '))
})

test('looksLikeUseModule accepts real module source', () => {
  assert.ok(looksLikeUseModule(FAKE_USE_M_SOURCE))
})

// --- loadUseM behaviour ----------------------------------------------------

test('loadUseM returns the exported use function on success', async () => {
  const fetchImpl = makeFetch([{ body: FAKE_USE_M_SOURCE }])
  const exported = await loadUseM({ fetch: fetchImpl, retryDelayMs: 0 })
  assert.type(exported.use, 'function')
  assert.is(exported.use(), 'loaded')
  assert.is(fetchImpl.calls.length, 1)
})

test('loadUseM falls back to the next CDN when the first returns an error body', async () => {
  const fetchImpl = makeFetch([
    { body: 'Internal Server Error' }, // unpkg returns garbage -> retried, then fall through
    { body: FAKE_USE_M_SOURCE },        // mirror succeeds
  ])
  const exported = await loadUseM({
    fetch: fetchImpl,
    sources: ['https://primary.example/use.js', 'https://mirror.example/use.js'],
    maxAttemptsPerSource: 1,
    retryDelayMs: 0,
  })
  assert.is(exported.use(), 'loaded')
  assert.equal(fetchImpl.calls, [
    'https://primary.example/use.js',
    'https://mirror.example/use.js',
  ])
})

test('loadUseM retries the same source before giving up', async () => {
  const fetchImpl = makeFetch([
    { ok: false, status: 500, statusText: 'Internal Server Error' },
    { ok: false, status: 500, statusText: 'Internal Server Error' },
    { body: FAKE_USE_M_SOURCE },
  ])
  const exported = await loadUseM({
    fetch: fetchImpl,
    sources: ['https://primary.example/use.js'],
    maxAttemptsPerSource: 3,
    retryDelayMs: 0,
  })
  assert.is(exported.use(), 'loaded')
  assert.is(fetchImpl.calls.length, 3)
})

test('loadUseM throws a clear, non-cryptic error when all CDNs fail', async () => {
  const fetchImpl = makeFetch([{ body: 'Internal Server Error' }])
  try {
    await loadUseM({
      fetch: fetchImpl,
      sources: ['https://primary.example/use.js', 'https://mirror.example/use.js'],
      maxAttemptsPerSource: 2,
      retryDelayMs: 0,
    })
    assert.unreachable('loadUseM should have thrown')
  } catch (error) {
    // Must NOT be the cryptic eval SyntaxError.
    assert.not.instance(error, SyntaxError)
    assert.match(error.message, /Failed to load use-m/)
    assert.match(error.message, /try again/)
    // Lists every attempt so the failure is diagnosable.
    assert.match(error.message, /primary\.example/)
    assert.match(error.message, /mirror\.example/)
  }
})

test('loadUseM reports HTTP failures clearly', async () => {
  const fetchImpl = makeFetch([{ ok: false, status: 503, statusText: 'Service Unavailable' }])
  try {
    await loadUseM({
      fetch: fetchImpl,
      sources: ['https://primary.example/use.js'],
      maxAttemptsPerSource: 1,
      retryDelayMs: 0,
    })
    assert.unreachable('loadUseM should have thrown')
  } catch (error) {
    assert.match(error.message, /HTTP 503/)
  }
})

test('loadUseM rejects a module that does not export use', async () => {
  const fetchImpl = makeFetch([{ body: '({ notUse: 1, value: "use this" })' }])
  try {
    await loadUseM({
      fetch: fetchImpl,
      sources: ['https://primary.example/use.js'],
      maxAttemptsPerSource: 1,
      retryDelayMs: 0,
    })
    assert.unreachable('loadUseM should have thrown')
  } catch (error) {
    assert.match(error.message, /did not export a `use` function/)
  }
})

test('loadUseM errors clearly when fetch is unavailable', async () => {
  try {
    await loadUseM({ fetch: null })
    assert.unreachable('loadUseM should have thrown')
  } catch (error) {
    assert.match(error.message, /fetch.*not available/)
  }
})

test.run()
