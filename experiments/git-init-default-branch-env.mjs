#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const gitDefaultBranchEnv = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'init.defaultBranch',
  GIT_CONFIG_VALUE_0: 'main'
}

function runGit(args, env = {}) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function runGitInit(env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'git-init-default-branch-env-'))
  const repoDir = join(root, 'repo')

  try {
    return runGit(['init', repoDir], env)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const configuredBranch = runGit(['config', '--get', 'init.defaultBranch'], gitDefaultBranchEnv)
const baseline = runGitInit()
const configured = runGitInit(gitDefaultBranchEnv)

const baselineOutput = `${baseline.stdout}${baseline.stderr}`
const configuredOutput = `${configured.stdout}${configured.stderr}`

console.log(`Git config env exposes init.defaultBranch: ${configuredBranch.stdout.trim()}`)
console.log(`Baseline default-branch hint present: ${baselineOutput.includes("Using 'master'") ? 'yes' : 'no'}`)
console.log(`Configured default-branch hint present: ${configuredOutput.includes("Using 'master'") ? 'yes' : 'no'}`)

if (configured.status !== 0) {
  console.error(configuredOutput)
  process.exit(configured.status)
}

if (configuredBranch.stdout.trim() !== 'main') {
  console.error('Expected Git config environment to expose init.defaultBranch=main')
  process.exit(1)
}

if (configuredOutput.includes("Using 'master'")) {
  console.error('Expected Git config environment to suppress default-branch hint')
  process.exit(1)
}
