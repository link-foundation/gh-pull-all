#!/usr/bin/env node

// Test uncommitted changes handling with local repositories and a fake gh CLI.
import { execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'gh-pull-all.mjs')

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

function getDiagnosticOutput(output) {
  const maxLength = 4000
  return output.length > maxLength ? `${output.slice(0, maxLength)}\n...<truncated>` : output
}

function assertIncludes(output, expected, message) {
  if (!output.includes(expected)) {
    throw new Error(`${message}\nExpected to find: ${expected}\nOutput:\n${getDiagnosticOutput(output)}`)
  }
}

function assertMatch(output, pattern, message) {
  if (!pattern.test(output)) {
    throw new Error(`${message}\nExpected pattern: ${pattern}\nOutput:\n${getDiagnosticOutput(output)}`)
  }
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  }).trim()
}

function runGhPullAll(args, env) {
  try {
    return execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`
    throw new Error(
      `Command failed: ${process.execPath} ${scriptPath} ${args.join(' ')}\n` +
      (output || error.message)
    )
  }
}

async function createRemoteRepository(remoteRoot, repoName) {
  const remoteBase = path.join(remoteRoot, repoName)
  const remoteGitDir = `${remoteBase}.git`
  const seedDir = path.join(remoteRoot, `${repoName}-seed`)

  await fs.mkdir(remoteRoot, { recursive: true })
  runGit(['init', '--quiet', '--bare', '--initial-branch=main', remoteGitDir])
  runGit(['init', '--quiet', '--initial-branch=main', seedDir])
  runGit(['-C', seedDir, 'config', 'user.email', 'test@example.com'])
  runGit(['-C', seedDir, 'config', 'user.name', 'Test User'])
  await fs.writeFile(path.join(seedDir, 'README.md'), `# ${repoName}\n`)
  runGit(['-C', seedDir, 'add', 'README.md'])
  runGit(['-C', seedDir, 'commit', '-m', 'Initial commit'])
  runGit(['-C', seedDir, 'remote', 'add', 'origin', remoteGitDir])
  runGit(['-C', seedDir, 'push', 'origin', 'main'])

  return pathToFileURL(remoteBase).href
}

async function setupLocalGhFixture(testRoot) {
  const remoteRoot = path.join(testRoot, 'remotes')
  const fakeBinDir = path.join(testRoot, 'bin')
  await fs.mkdir(fakeBinDir, { recursive: true })

  const repos = []
  for (const repoName of ['alpha-clean', 'beta-dirty', 'gamma-dirty']) {
    repos.push({
      name: repoName,
      isPrivate: false,
      url: await createRemoteRepository(remoteRoot, repoName),
      sshUrl: '',
      updatedAt: '2026-07-02T00:00:00Z'
    })
  }

  const fakeGhPath = path.join(fakeBinDir, 'gh')
  const fakeGhScript = `#!/usr/bin/env node
const repos = ${JSON.stringify(repos, null, 2)}
const args = process.argv.slice(2)

if (args[0] === '--version') {
  console.log('gh version 2.0.0-test')
  process.exit(0)
}

if (args[0] === 'auth' && args[1] === 'token') {
  process.exit(1)
}

if (args[0] === 'repo' && args[1] === 'list') {
  console.log(JSON.stringify(repos))
  process.exit(0)
}

console.error(\`unsupported fake gh command: \${args.join(' ')}\`)
process.exit(1)
`
  await fs.writeFile(fakeGhPath, fakeGhScript, { mode: 0o755 })

  return {
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`
    },
    repos
  }
}

async function testUncommittedChanges() {
  let testRoot

  try {
    log('blue', '🧪 Testing uncommitted changes handling...')

    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-test-uncommitted-'))
    const testDir = path.join(testRoot, 'repos')
    await fs.mkdir(testDir, { recursive: true })
    const { env } = await setupLocalGhFixture(testRoot)

    const cliArgs = [
      '--user',
      'local-uncommitted-owner',
      '--no-live-updates',
      '--dir',
      testDir
    ]

    log('cyan', '🔧 Step 1: Cloning local fixture repositories...')
    const firstRun = runGhPullAll(['--threads', '1', ...cliArgs], env)
    assertIncludes(firstRun, 'Cloned: 3', 'Initial clone should clone all fixture repositories')
    log('green', '✅ Initial clone completed')

    log('cyan', '🔧 Step 2: Adding uncommitted changes to two repositories...')
    const dirtyRepos = ['beta-dirty', 'gamma-dirty']
    for (const repoName of dirtyRepos) {
      await fs.writeFile(
        path.join(testDir, repoName, 'test-uncommitted.txt'),
        `Uncommitted change in ${repoName}\n`
      )
    }
    log('cyan', `🔧 Added uncommitted changes to ${dirtyRepos.join(' and ')}`)

    log('cyan', '🔧 Step 3: Running pull with uncommitted changes...')
    const secondRun = runGhPullAll(['--threads', '2', ...cliArgs], env)
    log('green', '✅ Uncommitted changes run completed')

    assertIncludes(secondRun, '🔄', 'Uncommitted changes status icon should be present')
    log('green', '✅ Uncommitted changes status icon found')

    assertIncludes(
      secondRun,
      'Has uncommitted changes, skipped',
      'Repositories with uncommitted changes should be skipped'
    )
    log('green', '✅ Uncommitted changes skip message found')

    assertMatch(
      secondRun,
      /🔄 Uncommitted changes:\s*2/,
      'Summary should include exactly two uncommitted repositories'
    )
    log('green', '✅ Uncommitted changes count found in summary')

    assertIncludes(secondRun, 'alpha-clean', 'Clean repository should still be processed')
    assertIncludes(secondRun, 'Successfully pulled', 'Clean repository should still be pulled')
    log('green', '✅ Clean repository was pulled successfully')

    for (const repoName of dirtyRepos) {
      const uncommittedFile = path.join(testDir, repoName, 'test-uncommitted.txt')
      await fs.access(uncommittedFile)
    }
    log('green', '✅ Uncommitted files preserved')

    log('green', '🎉 Uncommitted changes test passed!')
  } catch (error) {
    log('red', `❌ Uncommitted changes test failed: ${error.message}`)
    throw error
  } finally {
    try {
      if (testRoot) {
        await fs.rm(testRoot, {recursive: true, force: true})
      }
      log('cyan', '🧹 Cleaned up test directory')
    } catch (cleanupError) {
      log('yellow', `⚠️ Cleanup warning: ${cleanupError.message}`)
    }
  }
}

// Run the test
testUncommittedChanges().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})
