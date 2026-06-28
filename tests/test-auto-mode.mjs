#!/usr/bin/env bun

// End-to-end tests for default auto mode
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

function runGit(args) {
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe'
  })
}

async function createGitFolder(parentDir, repoName, remoteUrl) {
  const repoDir = path.join(parentDir, repoName)
  await fs.mkdir(repoDir, { recursive: true })
  runGit(['init', repoDir])
  runGit(['-C', repoDir, 'remote', 'add', 'origin', remoteUrl])
}

async function writeFakeGh(fakeBinDir, accounts, reposByOwner = {}) {
  const fakeGhPath = path.join(fakeBinDir, 'gh')
  const script = `#!/usr/bin/env node
const accounts = ${JSON.stringify(accounts)}
const reposByOwner = ${JSON.stringify(reposByOwner)}
const args = process.argv.slice(2)

if (args[0] === '--version') {
  console.log('gh version test')
  process.exit(0)
}

if (args[0] === 'auth' && args[1] === 'token') {
  process.exit(1)
}

if (args[0] === 'api' && args[1]?.startsWith('users/')) {
  const owner = args[1].slice('users/'.length)
  if (accounts[owner]) {
    console.log(JSON.stringify(accounts[owner]))
    process.exit(0)
  }
  process.exit(1)
}

if (args[0] === 'repo' && args[1] === 'list') {
  const owner = args[2]
  console.log(JSON.stringify(reposByOwner[owner] || []))
  process.exit(0)
}

console.error('unsupported fake gh command: ' + args.join(' '))
process.exit(1)
`

  await fs.mkdir(fakeBinDir, { recursive: true })
  await fs.writeFile(fakeGhPath, script)
  await fs.chmod(fakeGhPath, 0o755)
}

function runGhPullAll(args, env, input = '') {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env,
    input,
    encoding: 'utf8'
  })

  return {
    ...result,
    output: `${result.stdout || ''}${result.stderr || ''}`
  }
}

test('CLI auto-detects organization from existing child git remotes', async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-auto-mode-'))

  try {
    const fakeBinDir = path.join(testRoot, 'bin')
    const targetDir = path.join(testRoot, 'repos')
    await fs.mkdir(targetDir, { recursive: true })
    await createGitFolder(targetDir, 'repo-one', 'https://github.com/test-owner/repo-one.git')
    await createGitFolder(targetDir, 'repo-two', 'git@github.com:test-owner/repo-two.git')
    await writeFakeGh(fakeBinDir, {
      'test-owner': { login: 'test-owner', type: 'Organization' }
    })

    const result = runGhPullAll(
      ['--dir', targetDir, '--single-thread', '--no-live-updates'],
      {
        ...process.env,
        GITHUB_TOKEN: '',
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
      },
      'y\n'
    )

    assert.is(result.status, 0, result.output)
    assert.match(result.output, /Auto-detected test-owner organization from local git repositories/)
    assert.match(result.output, /Starting test-owner organization repository sync/)
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
})

test('CLI falls back to an empty target directory name when it exists on GitHub', async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-auto-empty-'))

  try {
    const fakeBinDir = path.join(testRoot, 'bin')
    const targetDir = path.join(testRoot, 'empty-owner')
    await fs.mkdir(targetDir, { recursive: true })
    await writeFakeGh(fakeBinDir, {
      'empty-owner': { login: 'empty-owner', type: 'User' }
    })

    const result = runGhPullAll(
      ['--dir', targetDir, '--single-thread', '--no-live-updates'],
      {
        ...process.env,
        GITHUB_TOKEN: '',
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`
      },
      'y\n'
    )

    assert.is(result.status, 0, result.output)
    assert.match(result.output, /Auto-detected empty-owner user from empty directory name 'empty-owner'/)
    assert.match(result.output, /Starting empty-owner user repository sync/)
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
})

test.run()
