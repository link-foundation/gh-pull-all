#!/usr/bin/env bun

// Regression test for https://github.com/link-foundation/gh-pull-all/issues/50
//
// use-m 8.16.3 started resolving yargs' ESM entry (via package.json `exports`)
// and unwrapping single-`default` ESM namespaces, so `use('yargs@17.7.2')`
// returned the yargs function itself instead of `{ default: yargs, ... }`.
// gh-pull-all destructured `{ default: yargs }`, got `undefined`, and crashed
// with `TypeError: yargs is not a function` on every run.
//
// getDefaultExport()/getNamedExport() must accept every shape use-m has
// returned, and the codebase must not go back to destructuring `default`.

import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import {
  loadUseM,
  getDefaultExport,
  getNamedExport,
  getSourcesFromEnv,
  isDebugEnabled,
  DEFAULT_SOURCES,
} from '../load-use-m.mjs'

const { use } = await loadUseM()
const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function withEnv(vars, fn) {
  const saved = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

// --- Shapes observed for `use('yargs@17.7.2')` across use-m releases --------
const yargsFn = function yargs() { return 'yargs' }

const callableWithDefault = function yargs() { return 'yargs' }
callableWithDefault.default = callableWithDefault

const YARGS_SHAPES = {
  'use-m <= 8.16.1 (CJS namespace)': { default: yargsFn, 'module.exports': yargsFn },
  'use-m 8.16.2 (unwrapped callable with default)': callableWithDefault,
  'use-m >= 8.16.3 (unwrapped ESM default, issue #50)': yargsFn,
  'double-wrapped default': { default: { default: yargsFn } },
}

for (const [label, shape] of Object.entries(YARGS_SHAPES)) {
  test(`getDefaultExport returns the yargs function for ${label}`, () => {
    const yargs = getDefaultExport(shape, { name: 'yargs', type: 'function' })
    assert.type(yargs, 'function')
    assert.is(yargs(), 'yargs')
  })
}

test('the pre-fix destructuring really breaks on the use-m >= 8.16.3 shape', () => {
  const { default: yargs } = YARGS_SHAPES['use-m >= 8.16.3 (unwrapped ESM default, issue #50)']
  assert.is(yargs, undefined)
})

test('getDefaultExport picks the simple-git factory from every shape', () => {
  const simpleGit = function simpleGit() { return 'git' }
  const shapes = [
    { default: simpleGit, 'module.exports': simpleGit },
    Object.assign(function simpleGit() { return 'git' }, { default: simpleGit, CleanOptions: {} }),
    { CleanOptions: {}, default: simpleGit, gitP: () => {} },
  ]
  for (const shape of shapes) {
    assert.is(getDefaultExport(shape, { name: 'simple-git', type: 'function' })(), 'git')
  }
})

test('getNamedExport finds simpleGit in simple-git 3.x and 4.x (no default) shapes', () => {
  const simpleGit = function simpleGit() { return 'git' }
  const shapes = [
    { default: simpleGit, simpleGit, CleanOptions: {} }, // simple-git 3.x ESM
    { default: { default: simpleGit, simpleGit } }, // simple-git 3.x CJS namespace
    { simpleGit, CleanOptions: {} }, // simple-git 4.x: default export removed
  ]
  for (const shape of shapes) {
    assert.is(getNamedExport(shape, 'simpleGit', { name: 'simple-git', type: 'function' })(), 'git')
  }
})

test('getDefaultExport with members finds object exports (fs-extra, semver)', () => {
  const fsExtra = { ensureDir: async () => 'ensured', remove: async () => 'removed' }
  // Namespace without named exports: only `default` has the API.
  const namespaceOnlyDefault = { default: fsExtra, 'module.exports': fsExtra }
  // Unwrapped object.
  const unwrapped = fsExtra
  for (const shape of [namespaceOnlyDefault, unwrapped]) {
    const fs = getDefaultExport(shape, { name: 'fs-extra', members: ['ensureDir', 'remove'] })
    assert.type(fs.ensureDir, 'function')
    assert.type(fs.remove, 'function')
  }

  const semver = { inc: () => '1.0.1' }
  assert.is(getDefaultExport({ default: semver }, { name: 'semver', members: ['inc'] }).inc(), '1.0.1')
  assert.is(getDefaultExport(semver, { name: 'semver', members: ['inc'] }).inc(), '1.0.1')
})

test('getDefaultExport without constraints prefers `default` when present', () => {
  const value = { a: 1 }
  assert.is(getDefaultExport({ default: value }), value)
  assert.is(getDefaultExport(value), value)
})

test('getDefaultExport throws a clear error when no shape matches', () => {
  try {
    getDefaultExport({ notYargs: 1 }, { name: 'yargs', type: 'function' })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.instance(error, TypeError)
    assert.match(error.message, /default export of 'yargs'/)
    assert.match(error.message, /expected function/)
    assert.match(error.message, /GH_PULL_ALL_DEBUG=1/)
  }
  try {
    getDefaultExport({ default: {} }, { name: 'fs-extra', members: ['ensureDir'] })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /with ensureDir/)
  }
})

test('getNamedExport finds hideBin / Octokit in namespace and wrapped shapes', () => {
  const hideBin = (argv) => argv.slice(2)
  const shapes = [
    { hideBin },
    { default: { hideBin } },
    { 'module.exports': { hideBin } },
  ]
  for (const shape of shapes) {
    assert.is(getNamedExport(shape, 'hideBin', { name: 'yargs/helpers', type: 'function' }), hideBin)
  }
  class Octokit {}
  assert.is(getNamedExport({ Octokit }, 'Octokit', { type: 'function' }), Octokit)
  assert.is(getNamedExport({ default: { Octokit } }, 'Octokit', { type: 'function' }), Octokit)
})

test('getNamedExport honours `optional` and throws otherwise', () => {
  assert.is(getNamedExport({}, 'hideBin', { optional: true }), undefined)
  assert.is(getNamedExport(undefined, 'hideBin', { optional: true }), undefined)
  try {
    getNamedExport({}, 'Octokit', { name: '@octokit/rest' })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /export 'Octokit' of '@octokit\/rest'/)
  }
})

test('GH_PULL_ALL_USE_M_URL pins the use-m source list', () => {
  withEnv({ GH_PULL_ALL_USE_M_URL: undefined }, () => {
    assert.is(getSourcesFromEnv(), null)
  })
  withEnv({ GH_PULL_ALL_USE_M_URL: ' https://a.example/use.js , https://b.example/use.js ' }, () => {
    assert.equal(getSourcesFromEnv(), ['https://a.example/use.js', 'https://b.example/use.js'])
  })
  assert.ok(DEFAULT_SOURCES.length >= 2)
})

test('loadUseM uses GH_PULL_ALL_USE_M_URL when no sources are passed', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return { ok: true, status: 200, text: async () => '({ use: function use() {} })' }
  }
  await withEnv({ GH_PULL_ALL_USE_M_URL: 'https://pinned.example/use-m@8.16.4/use.js' }, () =>
    loadUseM({ fetch: fetchImpl, retryDelayMs: 0 })
  )
  assert.equal(calls, ['https://pinned.example/use-m@8.16.4/use.js'])
})

test('debug tracing is off by default and enabled via GH_PULL_ALL_DEBUG or DEBUG', () => {
  withEnv({ GH_PULL_ALL_DEBUG: undefined, DEBUG: undefined }, () => assert.is(isDebugEnabled(), false))
  withEnv({ GH_PULL_ALL_DEBUG: '0', DEBUG: undefined }, () => assert.is(isDebugEnabled(), false))
  withEnv({ GH_PULL_ALL_DEBUG: '1', DEBUG: undefined }, () => assert.is(isDebugEnabled(), true))
  withEnv({ GH_PULL_ALL_DEBUG: undefined, DEBUG: 'foo,gh-pull-all' }, () => assert.is(isDebugEnabled(), true))
})

test('no source file destructures `default` straight from use() (issue #50)', () => {
  const pattern = /\{\s*default\s*:\s*\w+\s*\}\s*=\s*await\s+use\(/
  const dirs = [ROOT, path.join(ROOT, 'tests'), path.join(ROOT, 'scripts'), path.join(ROOT, 'demos')]
  const offenders = []
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.mjs')) continue
      const fullPath = path.join(dir, file)
      if (pattern.test(readFileSync(fullPath, 'utf8'))) offenders.push(path.relative(ROOT, fullPath))
    }
  }
  assert.equal(offenders, [], `use getDefaultExport() instead in: ${offenders.join(', ')}`)
})

test('gh-pull-all starts with the real use-m and parses arguments via yargs', () => {
  // Reaches past yargs parsing, the dependency imports and into the sync code,
  // which is exactly where the issue #50 crash happened.
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'gh-pull-all.mjs'),
    '--org', 'nonexistent-org-issue-50', '--dir', path.join(ROOT, '.tmp-issue-50-out'),
    '--single-thread', '--no-live-updates'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, GITHUB_TOKEN: 'dummy-token-issue-50', GH_PULL_ALL_DEBUG: '1' },
  })
  spawnSync('rm', ['-rf', path.join(ROOT, '.tmp-issue-50-out')])
  const output = `${result.stdout}\n${result.stderr}`
  assert.not.match(output, /is not a function/)
  assert.match(output, /yargs: use\(\) returned .*default export -> function/)
  assert.match(output, /Starting nonexistent-org-issue-50 organization repository sync/)
})

test.run()
