#!/usr/bin/env node

// Tests for multi-worktree support (https://github.com/link-foundation/gh-pull-all/issues/48)
//
// Covers the porcelain parser plus end to end behavior: linked worktrees must be
// pulled, and every check that protects data (uncommitted changes, deletion)
// must consider all worktrees, not only the main one.
import { execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  colors,
  createFakeGhCli,
  createLocalRemoteRepository,
  log,
  pushCommitToLocalRemote,
  runGit
} from './common-test-utils.mjs'

import {
  findWorktreeForBranch,
  isPathInside,
  parseWorktreeList,
  summarizeWorktreeResults
} from '../git-worktrees.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'gh-pull-all.mjs')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(output, expected, message) {
  if (!output.includes(expected)) {
    throw new Error(`${message}\nExpected to find: ${expected}\nOutput:\n${output}`)
  }
}

async function pathExists(target) {
  return fs.access(target).then(() => true, () => false)
}

function runGhPullAll(args, env, input = null) {
  try {
    return execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      input: input === null ? undefined : input,
      stdio: input === null ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`
  }
}

function testParseWorktreeList() {
  log('cyan', '🔧 Unit: parsing `git worktree list --porcelain` output')

  const output = [
    'worktree /repos/demo',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    'worktree /work/demo-feature',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/feature',
    '',
    'worktree /work/demo-detached',
    'HEAD 3333333333333333333333333333333333333333',
    'detached',
    '',
    'worktree /work/demo-gone',
    'HEAD 4444444444444444444444444444444444444444',
    'branch refs/heads/gone',
    'prunable gitdir file points to non-existent location',
    ''
  ].join('\n')

  const worktrees = parseWorktreeList(output)
  assert(worktrees.length === 4, `Expected 4 worktrees, got ${worktrees.length}`)
  assert(worktrees[0].isMain === true, 'First worktree must be marked as the main one')
  assert(worktrees[1].isMain === false, 'Linked worktrees must not be marked as main')
  assert(worktrees[1].branch === 'feature', 'Branch names must have refs/heads/ stripped')
  assert(worktrees[2].isDetached === true, 'Detached worktrees must be detected')
  assert(worktrees[3].isPrunable === true, 'Prunable worktrees must be detected')

  assert(parseWorktreeList('').length === 0, 'Empty output must produce no worktrees')

  const bare = parseWorktreeList('worktree /repos/bare\nbare\n')
  assert(bare[0].isBare === true, 'Bare worktrees must be detected')

  assert(findWorktreeForBranch(worktrees, 'feature').path === '/work/demo-feature', 'Branch lookup must find its worktree')
  assert(findWorktreeForBranch(worktrees, 'missing') === null, 'Unknown branches must resolve to null')

  assert(isPathInside('/repos/demo/inner', '/repos/demo') === true, 'Nested paths must be detected')
  assert(isPathInside('/work/demo-feature', '/repos/demo') === false, 'External paths must not be reported as nested')
  assert(isPathInside('/repos/demo', '/repos/demo') === false, 'A path is not inside itself')

  const summary = summarizeWorktreeResults([
    { success: true, type: 'pulled' },
    { success: true, type: 'uncommitted' },
    { success: true, type: 'detached' },
    { success: false, type: 'failed' }
  ])
  assert(summary.total === 4 && summary.pulled === 1, 'Summary must count pulled worktrees')
  assert(summary.uncommitted === 1 && summary.skipped === 1 && summary.failed === 1, 'Summary must classify every result')

  log('green', '✅ Worktree porcelain parsing works')
}

async function setupFixture(testRoot, repoName, options = {}) {
  const { extraBranches = ['feature'] } = options
  const remoteRoot = path.join(testRoot, 'remotes')
  const reposDir = path.join(testRoot, 'repos')
  await fs.mkdir(reposDir, { recursive: true })

  const remote = await createLocalRemoteRepository(remoteRoot, repoName, { extraBranches })
  const { env } = await createFakeGhCli(path.join(testRoot, 'bin'), [{
    name: repoName,
    isPrivate: false,
    url: remote.url,
    sshUrl: '',
    updatedAt: '2026-08-17T00:00:00Z'
  }])

  const cliArgs = ['--user', 'local-worktree-owner', '--no-live-updates', '--threads', '1', '--dir', reposDir]
  runGhPullAll(cliArgs, env)

  return { remote, reposDir, env, cliArgs, repoPath: path.join(reposDir, repoName) }
}

async function testPullUpdatesLinkedWorktrees() {
  log('cyan', '🔧 Integration: linked worktrees are fetched and pulled')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-pull-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-pull')
    const worktreePath = path.join(testRoot, 'worktree-pull-feature')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])

    await pushCommitToLocalRemote(fixture.remote.seedDir, 'main', 'main-update.txt', 'main update\n')
    await pushCommitToLocalRemote(fixture.remote.seedDir, 'feature', 'feature-update.txt', 'feature update\n')

    const output = runGhPullAll(fixture.cliArgs, fixture.env)
    assertIncludes(output, 'Successfully pulled', 'Repository should be reported as pulled')

    assert(await pathExists(path.join(fixture.repoPath, 'main-update.txt')), 'Main worktree must be pulled')
    assert(await pathExists(path.join(worktreePath, 'feature-update.txt')), 'Linked worktree must be pulled')

    log('green', '✅ Linked worktrees are pulled together with the main worktree')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function testNoWorktreesOptOut() {
  log('cyan', '🔧 Integration: --no-worktrees keeps the previous single worktree behavior')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-optout-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-optout')
    const worktreePath = path.join(testRoot, 'worktree-optout-feature')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])

    await pushCommitToLocalRemote(fixture.remote.seedDir, 'feature', 'feature-update.txt', 'feature update\n')

    runGhPullAll([...fixture.cliArgs, '--no-worktrees'], fixture.env)
    assert(
      !(await pathExists(path.join(worktreePath, 'feature-update.txt'))),
      'With --no-worktrees the linked worktree must be left untouched'
    )

    log('green', '✅ --no-worktrees disables worktree processing')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function testDirtyLinkedWorktreeIsSkipped() {
  log('cyan', '🔧 Integration: dirty linked worktrees are skipped, not overwritten')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-dirty-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-dirty')
    const worktreePath = path.join(testRoot, 'worktree-dirty-feature')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])
    await fs.writeFile(path.join(worktreePath, 'local-work.txt'), 'work in progress\n')

    await pushCommitToLocalRemote(fixture.remote.seedDir, 'feature', 'feature-update.txt', 'feature update\n')

    const output = runGhPullAll(fixture.cliArgs, fixture.env)
    assertIncludes(output, 'Successfully pulled 1 of 2 worktrees', 'Only the clean worktree should be pulled')
    assert(await pathExists(path.join(worktreePath, 'local-work.txt')), 'Uncommitted worktree file must survive')
    assert(
      !(await pathExists(path.join(worktreePath, 'feature-update.txt'))),
      'A dirty worktree must not be pulled'
    )

    log('green', '✅ Dirty linked worktrees are skipped')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function testDeleteChecksAllWorktrees() {
  log('cyan', '🔧 Integration: --delete checks uncommitted changes in every worktree')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-delete-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-delete')
    const worktreePath = path.join(testRoot, 'worktree-delete-feature')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])
    await fs.writeFile(path.join(worktreePath, 'local-work.txt'), 'work in progress\n')

    const output = runGhPullAll([...fixture.cliArgs, '--delete'], fixture.env, 'y\n')
    assertIncludes(output, 'Has uncommitted changes in worktrees', 'Delete must report the dirty worktree')
    assert(await pathExists(fixture.repoPath), 'Repository with a dirty worktree must not be deleted')
    assert(await pathExists(path.join(worktreePath, 'local-work.txt')), 'Uncommitted worktree data must survive --delete')

    log('green', '✅ --delete refuses to destroy uncommitted worktree data')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function testDeleteSkipsExternalWorktrees() {
  log('cyan', '🔧 Integration: --delete skips repositories with worktrees stored outside')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-external-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-external')
    const worktreePath = path.join(testRoot, 'worktree-external-feature')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])

    const output = runGhPullAll([...fixture.cliArgs, '--delete'], fixture.env, 'y\n')
    assertIncludes(output, 'Has linked worktrees outside', 'Delete must report external worktrees')
    assert(await pathExists(fixture.repoPath), 'Repository with external worktrees must not be deleted')
    assert(await pathExists(worktreePath), 'External worktree must stay usable')

    log('green', '✅ --delete keeps repositories whose worktrees live elsewhere')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function testSwitchToDefaultWithWorktreeHoldingDefault() {
  log('cyan', '🔧 Integration: --switch-to-default handles the default branch held by a worktree')
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-worktrees-switch-'))

  try {
    const fixture = await setupFixture(testRoot, 'worktree-switch')
    // Move the main worktree off main so that a linked worktree can hold it.
    runGit(['-C', fixture.repoPath, 'checkout', '-q', 'feature'])
    const worktreePath = path.join(testRoot, 'worktree-switch-main')
    runGit(['-C', fixture.repoPath, 'worktree', 'add', '--quiet', worktreePath, 'main'])

    await pushCommitToLocalRemote(fixture.remote.seedDir, 'main', 'main-update.txt', 'main update\n')

    const output = runGhPullAll([...fixture.cliArgs, '--switch-to-default'], fixture.env)
    assertIncludes(output, 'Default branch main is checked out in', 'Status must explain where the default branch lives')
    assert(await pathExists(path.join(worktreePath, 'main-update.txt')), 'Default branch worktree must be pulled')

    log('green', '✅ --switch-to-default pulls the default branch in its worktree')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

async function main() {
  log('blue', '🧪 Testing git worktree support...')

  testParseWorktreeList()
  await testPullUpdatesLinkedWorktrees()
  await testNoWorktreesOptOut()
  await testDirtyLinkedWorktreeIsSkipped()
  await testDeleteChecksAllWorktrees()
  await testDeleteSkipsExternalWorktrees()
  await testSwitchToDefaultWithWorktreeHoldingDefault()

  log('green', '🎉 All worktree tests passed!')
}

main().catch(error => {
  console.log(`${colors.red}💥 Worktree test failed: ${error.message}${colors.reset}`)
  process.exit(1)
})
