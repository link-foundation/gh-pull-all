#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'gh-pull-all.mjs')

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe'
  })
}

function configureGitUser(repoDir) {
  runGit(['-C', repoDir, 'config', 'user.name', 'Test User'])
  runGit(['-C', repoDir, 'config', 'user.email', 'test@example.com'])
}

function runCli(args, env = process.env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...env, CI: '1' },
    encoding: 'utf8'
  })

  return {
    ...result,
    output: `${result.stdout || ''}${result.stderr || ''}`
  }
}

async function writeFakeGh(fakeBinDir, repos) {
  const ghPath = path.join(fakeBinDir, 'gh')
  const reposJson = JSON.stringify(repos)
  const script = `#!/usr/bin/env bash
set -euo pipefail

case "\${1:-}" in
  --version)
    printf '%s\\n' 'gh version test'
    exit 0
    ;;
  auth)
    if [[ "\${2:-}" == "token" ]]; then
      exit 1
    fi
    ;;
  repo)
    if [[ "\${2:-}" == "list" ]]; then
      printf '%s\\n' ${shellQuote(reposJson)}
      exit 0
    fi
    ;;
esac

printf 'unexpected gh arguments: %s\\n' "$*" >&2
exit 1
`
  await fs.mkdir(fakeBinDir, { recursive: true })
  await fs.writeFile(ghPath, script)
  await fs.chmod(ghPath, 0o755)
}

async function createRemoteWithCommit(workDir, repoName, branchName, fileName, content) {
  const remoteGitDir = path.join(workDir, 'remotes', `${repoName}.git`)
  const seedDir = path.join(workDir, `seed-${repoName}`)

  await fs.mkdir(path.dirname(remoteGitDir), { recursive: true })
  runGit(['init', '--bare', remoteGitDir])
  await fs.mkdir(seedDir, { recursive: true })
  runGit(['init', seedDir])
  configureGitUser(seedDir)
  await fs.writeFile(path.join(seedDir, fileName), content)
  runGit(['-C', seedDir, 'add', fileName])
  runGit(['-C', seedDir, 'commit', '-m', `Add ${fileName}`])
  runGit(['-C', seedDir, 'branch', '-M', branchName])
  runGit(['-C', seedDir, 'remote', 'add', 'origin', remoteGitDir])
  runGit(['-C', seedDir, 'push', 'origin', `${branchName}:${branchName}`])
  runGit(['-C', remoteGitDir, 'symbolic-ref', 'HEAD', `refs/heads/${branchName}`])

  return remoteGitDir
}

async function addCommitToRemote(remoteGitDir, workDir, branchName, fileName, content) {
  const updateDir = path.join(workDir, `update-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`)

  runGit(['clone', remoteGitDir, updateDir])
  configureGitUser(updateDir)
  runGit(['-C', updateDir, 'checkout', branchName])
  await fs.writeFile(path.join(updateDir, fileName), content)
  runGit(['-C', updateDir, 'add', fileName])
  runGit(['-C', updateDir, 'commit', '-m', `Update ${fileName}`])
  runGit(['-C', updateDir, 'push', 'origin', `${branchName}:${branchName}`])
}

function repoListEntry(repoName, remoteGitDir, extra = {}) {
  return {
    name: repoName,
    isPrivate: false,
    url: remoteGitDir.replace(/\.git$/, ''),
    sshUrl: remoteGitDir,
    updatedAt: '2026-06-28T00:00:00Z',
    isFork: false,
    parent: null,
    ...extra
  }
}

async function testHelpAndValidation() {
  const help = runCli(['--help'])
  assert.equal(help.status, 0, help.output)
  assert.match(help.output, /--pull-changes-to-fork/)
  assert.match(help.output, /Sync forked repositories with their/)
  assert.match(help.output, /upstream repositories/)

  const switchConflict = runCli([
    '--user',
    'local-owner',
    '--pull-changes-to-fork',
    '--switch-to-default'
  ])
  assert.notEqual(switchConflict.status, 0, switchConflict.output)
  assert.match(
    switchConflict.output,
    /Cannot specify both --pull-changes-to-fork and --switch-to-default/
  )

  const pullConflict = runCli([
    '--user',
    'local-owner',
    '--pull-changes-to-fork',
    '--pull-from-default'
  ])
  assert.notEqual(pullConflict.status, 0, pullConflict.output)
  assert.match(
    pullConflict.output,
    /Cannot specify both --pull-changes-to-fork and --pull-from-default/
  )
}

async function testForkSyncPushesUpstreamChangesToFork() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-fork-sync-'))

  try {
    const repoName = 'forked-repo'
    const targetDir = path.join(workDir, 'repos')
    const fakeBinDir = path.join(workDir, 'bin')
    await fs.mkdir(targetDir, { recursive: true })

    const upstreamGitDir = await createRemoteWithCommit(
      workDir,
      'upstream-repo',
      'main',
      'README.md',
      '# Upstream\n'
    )
    const forkGitDir = path.join(workDir, 'remotes', `${repoName}.git`)
    runGit(['clone', '--bare', upstreamGitDir, forkGitDir])
    runGit(['-C', forkGitDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'])

    await addCommitToRemote(
      upstreamGitDir,
      workDir,
      'main',
      'upstream-change.txt',
      'change from upstream\n'
    )

    runGit(['clone', forkGitDir, path.join(targetDir, repoName)])

    await writeFakeGh(fakeBinDir, [
      repoListEntry(repoName, forkGitDir, {
        isFork: true,
        parent: {
          name: 'upstream-repo',
          full_name: 'upstream-owner/upstream-repo',
          clone_url: upstreamGitDir,
          ssh_url: upstreamGitDir,
          default_branch: 'main',
          owner: { login: 'upstream-owner' }
        }
      })
    ])

    const result = runCli([
      '--user',
      'local-fork-owner',
      '--single-thread',
      '--no-live-updates',
      '--pull-changes-to-fork',
      '--dir',
      targetDir
    ], {
      ...process.env,
      GITHUB_TOKEN: '',
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
    })

    assert.equal(result.status, 0, result.output)
    assert.match(result.output, /Successfully synced fork with upstream\/main/)
    assert.equal(
      runGit(['--git-dir', forkGitDir, 'show', 'main:upstream-change.txt']),
      'change from upstream\n'
    )
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

async function testNonForksAreSkippedWithoutCloning() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-non-fork-'))

  try {
    const repoName = 'regular-repo'
    const targetDir = path.join(workDir, 'repos')
    const fakeBinDir = path.join(workDir, 'bin')
    await fs.mkdir(targetDir, { recursive: true })

    const regularGitDir = await createRemoteWithCommit(
      workDir,
      repoName,
      'main',
      'README.md',
      '# Regular\n'
    )
    await writeFakeGh(fakeBinDir, [repoListEntry(repoName, regularGitDir)])

    const result = runCli([
      '--user',
      'local-owner',
      '--single-thread',
      '--no-live-updates',
      '--pull-changes-to-fork',
      '--dir',
      targetDir
    ], {
      ...process.env,
      GITHUB_TOKEN: '',
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
    })

    assert.equal(result.status, 0, result.output)
    assert.match(result.output, /Not a fork/)
    await assert.rejects(fs.stat(path.join(targetDir, repoName)), { code: 'ENOENT' })
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

await testHelpAndValidation()
await testForkSyncPushesUpstreamChangesToFork()
await testNonForksAreSkippedWithoutCloning()

console.log('Pull changes to fork tests passed')
