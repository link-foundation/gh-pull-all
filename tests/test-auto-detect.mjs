#!/usr/bin/env bun

// Tests for default auto-detection helpers
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const { default: git } = await use('simple-git@3.28.0')
import { execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import {
  detectOwnerFromGitFolders,
  extractGitHubOwnerFromRemoteUrl,
  parseGitHubOwner
} from '../auto-detect.mjs'

function runGit(args) {
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe'
  })
}

async function withTempDir(callback) {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-auto-detect-'))

  try {
    return await callback(testRoot)
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function createGitFolder(parentDir, repoName, remoteUrl) {
  const repoDir = path.join(parentDir, repoName)
  await fs.mkdir(repoDir, { recursive: true })
  runGit(['init', repoDir])
  runGit(['-C', repoDir, 'remote', 'add', 'origin', remoteUrl])
}

test('parseGitHubOwner accepts names and GitHub URLs', () => {
  assert.is(parseGitHubOwner('octocat'), 'octocat')
  assert.is(parseGitHubOwner('github.com/link-foundation'), 'link-foundation')
  assert.is(parseGitHubOwner('https://github.com/link-foundation/gh-pull-all'), 'link-foundation')
  assert.is(parseGitHubOwner('http://github.com/link-foundation'), 'link-foundation')
  assert.is(parseGitHubOwner('git@github.com:link-foundation/gh-pull-all.git'), 'link-foundation')
  assert.is(parseGitHubOwner('https://gitlab.com/link-foundation'), null)
  assert.is(parseGitHubOwner('not a valid owner'), null)
})

test('extractGitHubOwnerFromRemoteUrl supports common remote formats', () => {
  assert.is(extractGitHubOwnerFromRemoteUrl('https://github.com/link-foundation/gh-pull-all.git'), 'link-foundation')
  assert.is(extractGitHubOwnerFromRemoteUrl('git@github.com:link-foundation/gh-pull-all.git'), 'link-foundation')
  assert.is(extractGitHubOwnerFromRemoteUrl('ssh://git@github.com/link-foundation/gh-pull-all.git'), 'link-foundation')
  assert.is(extractGitHubOwnerFromRemoteUrl('/tmp/local-repo.git'), null)
})

test('detectOwnerFromGitFolders detects one owner from child git repositories', async () => {
  await withTempDir(async (testRoot) => {
    await createGitFolder(testRoot, 'repo-one', 'https://github.com/link-foundation/repo-one.git')
    await createGitFolder(testRoot, 'repo-two', 'git@github.com:link-foundation/repo-two.git')
    await fs.mkdir(path.join(testRoot, 'not-a-git-repo'))

    const result = await detectOwnerFromGitFolders(testRoot, git)

    assert.is(result.reason, 'single-owner')
    assert.is(result.owner, 'link-foundation')
    assert.is(result.gitRepositories.length, 2)
  })
})

test('detectOwnerFromGitFolders reports multiple owners as ambiguous', async () => {
  await withTempDir(async (testRoot) => {
    await createGitFolder(testRoot, 'repo-one', 'https://github.com/link-foundation/repo-one.git')
    await createGitFolder(testRoot, 'repo-two', 'https://github.com/octocat/repo-two.git')

    const result = await detectOwnerFromGitFolders(testRoot, git)

    assert.is(result.reason, 'multiple-owners')
    assert.is(result.owner, null)
    assert.is(result.owners.length, 2)
  })
})

test('detectOwnerFromGitFolders ignores ordinary child folders inside a parent git worktree', async () => {
  await withTempDir(async (testRoot) => {
    runGit(['init', testRoot])
    runGit(['-C', testRoot, 'remote', 'add', 'origin', 'https://github.com/link-foundation/parent.git'])
    await fs.mkdir(path.join(testRoot, 'ordinary-folder'))

    const result = await detectOwnerFromGitFolders(testRoot, git)

    assert.is(result.reason, 'no-git-repositories')
    assert.is(result.owner, null)
  })
})

test('detectOwnerFromGitFolders reports empty directories for folder-name fallback', async () => {
  await withTempDir(async (testRoot) => {
    const result = await detectOwnerFromGitFolders(testRoot, git)

    assert.is(result.reason, 'empty')
    assert.is(result.isEmpty, true)
  })
})

test('detectOwnerFromGitFolders blocks git repositories without GitHub remotes', async () => {
  await withTempDir(async (testRoot) => {
    await createGitFolder(testRoot, 'local-only', '/tmp/local-only.git')

    const result = await detectOwnerFromGitFolders(testRoot, git)

    assert.is(result.reason, 'unknown-remotes')
    assert.equal(result.unknownGitRepositories, ['local-only'])
  })
})

test.run()
