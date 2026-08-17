#!/usr/bin/env node

// Reproduction for https://github.com/link-foundation/gh-pull-all/issues/48
//
// Creates a local remote repository with two branches, clones it through
// gh-pull-all, attaches a linked git worktree for the second branch, pushes new
// commits to both branches, and then runs gh-pull-all again.
//
// Before the fix, only the main worktree advanced: the linked worktree stayed on
// the old commit even though its branch had new upstream commits.
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
} from '../tests/common-test-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'gh-pull-all.mjs')

function runGhPullAll(args, env) {
  try {
    return execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`
  }
}

async function main() {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-issue-48-'))

  try {
    const remoteRoot = path.join(testRoot, 'remotes')
    const reposDir = path.join(testRoot, 'repos')
    await fs.mkdir(reposDir, { recursive: true })

    const remote = await createLocalRemoteRepository(remoteRoot, 'worktree-repo', {
      extraBranches: ['feature']
    })

    const { env } = await createFakeGhCli(path.join(testRoot, 'bin'), [{
      name: 'worktree-repo',
      isPrivate: false,
      url: remote.url,
      sshUrl: '',
      updatedAt: '2026-08-17T00:00:00Z'
    }])

    const cliArgs = ['--user', 'local-worktree-owner', '--no-live-updates', '--threads', '1', '--dir', reposDir]

    log('cyan', '🔧 Step 1: cloning fixture repository')
    runGhPullAll(cliArgs, env)

    const repoPath = path.join(reposDir, 'worktree-repo')
    const worktreePath = path.join(testRoot, 'worktree-repo-feature')

    log('cyan', '🔧 Step 2: attaching a linked worktree for the feature branch')
    runGit(['-C', repoPath, 'worktree', 'add', '--quiet', worktreePath, 'feature'])

    log('cyan', '🔧 Step 3: pushing new commits to main and feature')
    await pushCommitToLocalRemote(remote.seedDir, 'main', 'main-update.txt', 'main update\n')
    await pushCommitToLocalRemote(remote.seedDir, 'feature', 'feature-update.txt', 'feature update\n')

    log('cyan', '🔧 Step 4: running gh-pull-all again')
    const output = runGhPullAll(cliArgs, env)
    console.log(`${colors.dim}${output}${colors.reset}`)

    const mainUpdated = await fs.access(path.join(repoPath, 'main-update.txt')).then(() => true, () => false)
    const worktreeUpdated = await fs.access(path.join(worktreePath, 'feature-update.txt')).then(() => true, () => false)

    log(mainUpdated ? 'green' : 'red', `main worktree pulled: ${mainUpdated}`)
    log(worktreeUpdated ? 'green' : 'red', `linked worktree pulled: ${worktreeUpdated}`)

    if (mainUpdated && !worktreeUpdated) {
      log('yellow', '🐛 Reproduced issue #48: linked worktrees are never fetched or pulled')
      return
    }

    if (mainUpdated && worktreeUpdated) {
      log('green', '✅ Both the main worktree and the linked worktree are up to date')
      return
    }

    log('red', '❓ Unexpected state: the main worktree itself was not pulled')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  log('red', `💥 Reproduction failed: ${error.message}`)
  process.exit(1)
})
