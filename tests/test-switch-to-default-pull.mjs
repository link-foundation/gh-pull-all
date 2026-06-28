#!/usr/bin/env bun

// Regression tests for switching to the default branch and synchronizing it.
import { loadUseM } from '../load-use-m.mjs'
const { use } = await loadUseM()

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { execFileSync, spawnSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

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

function runGhPullAll(args, env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env,
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
  const safeFileName = fileName.replace(/[^a-zA-Z0-9]/g, '-')
  const updateDir = path.join(workDir, `update-${branchName}-${safeFileName}`)

  runGit(['clone', remoteGitDir, updateDir])
  configureGitUser(updateDir)
  runGit(['-C', updateDir, 'checkout', branchName])
  await fs.writeFile(path.join(updateDir, fileName), content)
  runGit(['-C', updateDir, 'add', fileName])
  runGit(['-C', updateDir, 'commit', '-m', `Update ${fileName}`])
  runGit(['-C', updateDir, 'push', 'origin', `${branchName}:${branchName}`])
}

async function createCliFixture(suffix, repoName, remoteGitDir) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `gh-pull-all-${suffix}-`))
  const targetDir = path.join(workDir, 'repos')
  const fakeBinDir = path.join(workDir, 'bin')

  await fs.mkdir(targetDir, { recursive: true })
  await writeFakeGh(fakeBinDir, [{
    name: repoName,
    isPrivate: false,
    url: remoteGitDir.replace(/\.git$/, ''),
    sshUrl: remoteGitDir,
    updatedAt: '2026-06-28T00:00:00Z'
  }])

  return {
    workDir,
    targetDir,
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
    },
    cliArgs: [
      '--user', 'local-switch-owner',
      '--single-thread',
      '--no-live-updates',
      '--switch-to-default',
      '--dir', targetDir
    ]
  }
}

test('switch-to-default fetches before creating a missing local default branch', async () => {
  const setupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-switch-fetch-setup-'))
  const repoName = 'repo-fetch-before-switch'
  const remoteGitDir = await createRemoteWithCommit(
    setupDir,
    repoName,
    'main',
    'main.txt',
    'main content from remote\n'
  )
  const fixture = await createCliFixture('switch-fetch', repoName, remoteGitDir)

  try {
    const localRepoDir = path.join(fixture.targetDir, repoName)
    await fs.mkdir(localRepoDir, { recursive: true })
    runGit(['init', localRepoDir])
    configureGitUser(localRepoDir)
    await fs.writeFile(path.join(localRepoDir, 'feature.txt'), 'local feature branch\n')
    runGit(['-C', localRepoDir, 'add', 'feature.txt'])
    runGit(['-C', localRepoDir, 'commit', '-m', 'Create feature branch'])
    runGit(['-C', localRepoDir, 'branch', '-M', 'feature'])
    runGit(['-C', localRepoDir, 'remote', 'add', 'origin', remoteGitDir])

    const result = runGhPullAll(fixture.cliArgs, fixture.env)
    assert.is(result.status, 0, result.output)

    const currentBranch = runGit(['-C', localRepoDir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const mainContent = await fs.readFile(path.join(localRepoDir, 'main.txt'), 'utf8')
    assert.is(currentBranch, 'main')
    assert.is(mainContent, 'main content from remote\n')
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
    await fs.rm(setupDir, { recursive: true, force: true })
  }
})

test('switch-to-default pulls after checking out an existing default branch', async () => {
  const setupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-switch-pull-setup-'))
  const repoName = 'repo-pull-after-switch'
  const remoteGitDir = await createRemoteWithCommit(
    setupDir,
    repoName,
    'main',
    'README.md',
    '# Pull after switch\n'
  )
  const fixture = await createCliFixture('switch-pull', repoName, remoteGitDir)

  try {
    const localRepoDir = path.join(fixture.targetDir, repoName)
    runGit(['clone', remoteGitDir, localRepoDir])
    configureGitUser(localRepoDir)
    runGit(['-C', localRepoDir, 'checkout', '-b', 'feature'])
    await fs.writeFile(path.join(localRepoDir, 'feature.txt'), 'local feature work\n')
    runGit(['-C', localRepoDir, 'add', 'feature.txt'])
    runGit(['-C', localRepoDir, 'commit', '-m', 'Add feature work'])

    await addCommitToRemote(
      remoteGitDir,
      setupDir,
      'main',
      'remote-change.txt',
      'remote change after local branch was created\n'
    )

    const result = runGhPullAll(fixture.cliArgs, fixture.env)
    assert.is(result.status, 0, result.output)

    const currentBranch = runGit(['-C', localRepoDir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const remoteChange = await fs.readFile(path.join(localRepoDir, 'remote-change.txt'), 'utf8')
    assert.is(currentBranch, 'main')
    assert.is(remoteChange, 'remote change after local branch was created\n')
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
    await fs.rm(setupDir, { recursive: true, force: true })
  }
})

test('switch-to-default pulls when already on the default branch', async () => {
  const setupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-switch-current-setup-'))
  const repoName = 'repo-already-default'
  const remoteGitDir = await createRemoteWithCommit(
    setupDir,
    repoName,
    'main',
    'README.md',
    '# Already default\n'
  )
  const fixture = await createCliFixture('switch-current', repoName, remoteGitDir)

  try {
    const localRepoDir = path.join(fixture.targetDir, repoName)
    runGit(['clone', remoteGitDir, localRepoDir])

    await addCommitToRemote(
      remoteGitDir,
      setupDir,
      'main',
      'already-default-change.txt',
      'remote change while already on default\n'
    )

    const result = runGhPullAll(fixture.cliArgs, fixture.env)
    assert.is(result.status, 0, result.output)

    const currentBranch = runGit(['-C', localRepoDir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const remoteChange = await fs.readFile(path.join(localRepoDir, 'already-default-change.txt'), 'utf8')
    assert.is(currentBranch, 'main')
    assert.is(remoteChange, 'remote change while already on default\n')
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
    await fs.rm(setupDir, { recursive: true, force: true })
  }
})

test.run()
