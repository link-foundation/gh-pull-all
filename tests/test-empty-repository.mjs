#!/usr/bin/env bun

// Regression test for https://github.com/link-foundation/gh-pull-all/issues/38
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

function runGhPullAll(args, env) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8'
  })
}

async function createEmptyRepoFixture(suffix, repoName = 'empty-repo') {
  const workDir = path.join(os.tmpdir(), `gh-pull-all-${suffix}-${process.pid}`)
  const remoteBase = path.join(workDir, 'remotes', repoName)
  const remoteGitDir = `${remoteBase}.git`
  const targetDir = path.join(workDir, 'repos')
  const fakeBinDir = path.join(workDir, 'bin')

  await fs.rm(workDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(remoteGitDir), { recursive: true })
  await fs.mkdir(targetDir, { recursive: true })
  await fs.mkdir(fakeBinDir, { recursive: true })

  runGit(['init', '--bare', remoteGitDir])
  runGit(['-C', remoteGitDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'])

  await writeFakeGh(fakeBinDir, [{
    name: repoName,
    isPrivate: false,
    url: remoteBase,
    sshUrl: remoteGitDir,
    updatedAt: '2026-06-25T00:00:00Z'
  }])

  return {
    workDir,
    remoteGitDir,
    targetDir,
    repoName,
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
    },
    cliArgs: [
      '--user', 'local-empty-owner',
      '--single-thread',
      '--no-live-updates',
      '--dir', targetDir
    ]
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
  await fs.writeFile(ghPath, script)
  await fs.chmod(ghPath, 0o755)
}

async function addFirstCommitToRemote(remoteGitDir, branchName, workDir) {
  const seedDir = path.join(workDir, `seed-${branchName}`)
  await fs.mkdir(seedDir, { recursive: true })
  runGit(['init', seedDir])
  runGit(['-C', seedDir, 'config', 'user.name', 'Test User'])
  runGit(['-C', seedDir, 'config', 'user.email', 'test@example.com'])
  await fs.writeFile(
    path.join(seedDir, 'README.md'),
    `# Empty repository\n\nDefault branch ${branchName} now exists.\n`
  )
  runGit(['-C', seedDir, 'add', 'README.md'])
  runGit(['-C', seedDir, 'commit', '-m', `Create ${branchName}`])
  runGit(['-C', seedDir, 'branch', '-M', branchName])
  runGit(['-C', seedDir, 'remote', 'add', 'origin', remoteGitDir])
  runGit(['-C', seedDir, 'push', 'origin', `${branchName}:${branchName}`])
  runGit(['-C', remoteGitDir, 'symbolic-ref', 'HEAD', `refs/heads/${branchName}`])
}

test('empty repository can be pulled again without reporting a stale upstream error', async () => {
  const fixture = await createEmptyRepoFixture('empty-repo')

  try {
    const firstRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const firstOutput = `${firstRun.stdout}${firstRun.stderr}`
    assert.is(firstRun.status, 0, firstOutput)
    assert.match(firstOutput, /Successfully cloned/)

    const secondRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const secondOutput = `${secondRun.stdout}${secondRun.stderr}`
    assert.is(secondRun.status, 0, secondOutput)
    assert.ok(/Successfully pulled/.test(secondOutput), secondOutput)
    assert.not.ok(/Your configuration specifies to merge with the ref/.test(secondOutput), secondOutput)
    assert.not.ok(/Failed with error/.test(secondOutput), secondOutput)
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
  }
})

test('empty repository pulls when the configured default branch appears later', async () => {
  const fixture = await createEmptyRepoFixture('default-branch-main-appears')

  try {
    const firstRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const firstOutput = `${firstRun.stdout}${firstRun.stderr}`
    assert.is(firstRun.status, 0, firstOutput)
    assert.match(firstOutput, /Successfully cloned/)

    await addFirstCommitToRemote(fixture.remoteGitDir, 'main', fixture.workDir)

    const secondRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const secondOutput = `${secondRun.stdout}${secondRun.stderr}`
    assert.is(secondRun.status, 0, secondOutput)
    assert.ok(/Successfully pulled main/.test(secondOutput), secondOutput)
    assert.not.ok(/Your configuration specifies to merge with the ref/.test(secondOutput), secondOutput)
    assert.not.ok(/Failed with error/.test(secondOutput), secondOutput)

    const localRepoDir = path.join(fixture.targetDir, fixture.repoName)
    const currentBranch = runGit(['-C', localRepoDir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const readme = await fs.readFile(path.join(localRepoDir, 'README.md'), 'utf8')
    assert.is(currentBranch, 'main')
    assert.match(readme, /Default branch main now exists/)
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
  }
})

test('empty repository pulls and switches when a default branch appears later', async () => {
  const fixture = await createEmptyRepoFixture('default-branch-appears')

  try {
    const firstRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const firstOutput = `${firstRun.stdout}${firstRun.stderr}`
    assert.is(firstRun.status, 0, firstOutput)
    assert.match(firstOutput, /Successfully cloned/)

    await addFirstCommitToRemote(fixture.remoteGitDir, 'trunk', fixture.workDir)

    const secondRun = runGhPullAll(fixture.cliArgs, fixture.env)
    const secondOutput = `${secondRun.stdout}${secondRun.stderr}`
    assert.is(secondRun.status, 0, secondOutput)
    assert.ok(/Successfully pulled trunk/.test(secondOutput), secondOutput)
    assert.not.ok(/Failed with error/.test(secondOutput), secondOutput)

    const localRepoDir = path.join(fixture.targetDir, fixture.repoName)
    const currentBranch = runGit(['-C', localRepoDir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const readme = await fs.readFile(path.join(localRepoDir, 'README.md'), 'utf8')
    assert.is(currentBranch, 'trunk')
    assert.match(readme, /Default branch trunk now exists/)
  } finally {
    await fs.rm(fixture.workDir, { recursive: true, force: true })
  }
})

test.run()
