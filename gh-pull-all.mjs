#!/usr/bin/env sh
':' //# ; exec "$(command -v node || command -v bun)" "$0" "$@"

// Import built-in Node.js modules
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { existsSync, readFileSync, realpathSync } from 'fs'
import { stat as statPath } from 'fs/promises'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PACKAGE_NAME = 'gh-pull-all'
let version = '1.4.3' // Fallback version

function normalizeVersion(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function readPackageVersion(packagePath) {
  try {
    if (!existsSync(packagePath)) {
      return null
    }

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (packageJson.name !== PACKAGE_NAME) {
      return null
    }

    return normalizeVersion(packageJson.version)
  } catch (error) {
    return null
  }
}

function getVersionFromDirectory(startDir) {
  let currentDir = startDir

  for (let depth = 0; depth < 10; depth++) {
    for (const packagePath of [
      path.join(currentDir, 'package.json'),
      path.join(currentDir, 'node_modules', PACKAGE_NAME, 'package.json'),
      path.join(currentDir, 'lib', 'node_modules', PACKAGE_NAME, 'package.json')
    ]) {
      const detectedVersion = readPackageVersion(packagePath)
      if (detectedVersion) {
        return detectedVersion
      }
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return null
}

function getVersionSync() {
  const candidateDirs = new Set([__dirname])

  for (const filename of [__filename, process.argv[1]]) {
    if (!filename) {
      continue
    }

    try {
      candidateDirs.add(path.dirname(realpathSync(filename)))
    } catch (error) {
      // Ignore paths that are unavailable in the current runtime.
    }
  }

  for (const candidateDir of candidateDirs) {
    const detectedVersion = getVersionFromDirectory(candidateDir)
    if (detectedVersion) {
      return detectedVersion
    }
  }

  return version
}

function hasAnyArg(args, names) {
  return args.some(arg => names.includes(arg))
}

const startupArgs = process.argv.slice(2)
if (hasAnyArg(startupArgs, ['--version', '-v']) && !hasAnyArg(startupArgs, ['--help', '-h'])) {
  console.log(getVersionSync())
  process.exit(0)
}

if (hasAnyArg(startupArgs, ['--help', '-h'])) {
  const { HELP_TEXT } = await import('./help-text.mjs')
  console.log(HELP_TEXT.trim())
  process.exit(0)
}

const { DEFAULTS, StatusDisplay, log } = await import('./status-display.mjs')
const { normalizeExplicitTarget, resolveAutoTarget } = await import('./auto-detect.mjs')

// Download use-m dynamically (robustly, with CDN fallback and clear errors).
// A bare `eval(await (await fetch(...)).text())` crashes with a cryptic
// SyntaxError when a CDN returns an error body instead of the module source.
// See https://github.com/link-foundation/gh-pull-all/issues/35.
const { loadUseM } = await import('./load-use-m.mjs')
const { use } = await loadUseM()

// Import CLI parsing before heavier sync dependencies so help can print quickly.
const { default: yargs } = await use('yargs@17.7.2')
const yargsHelpers = await use('yargs@17.7.2/helpers')
const hideBin = yargsHelpers.hideBin || yargsHelpers.default?.hideBin || ((argv) => argv.slice(2))

version = getVersionSync()

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    let resolved = false

    rl.on('close', () => {
      if (!resolved) {
        resolved = true
        resolve('')
      }
    })

    rl.question(question, (answer) => {
      resolved = true
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function askConfirmation(question, defaultValue = false) {
  const answer = await askQuestion(question)
  if (!answer) {
    return defaultValue
  }

  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

// Configure CLI arguments
const scriptName = path.basename(process.argv[1])
const rawArgs = hideBin(process.argv)
const isHelpRequest = rawArgs.some(arg => arg === '--help' || arg === '-h')
const isVersionRequest = rawArgs.some(arg => arg === '--version' || arg === '-v')
const isHelpOrVersionRequest = isHelpRequest || isVersionRequest
const yargsInput = isHelpRequest ? [] : rawArgs

function readThreadOption(args) {
  let value

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--threads' || arg === '-j') {
      value = args[i + 1]
      i++
    } else if (arg.startsWith('--threads=')) {
      value = arg.slice('--threads='.length)
    } else if (arg.startsWith('-j') && arg.length > 2) {
      value = arg.slice(2)
    }
  }

  return value === undefined ? undefined : Number(value)
}

const cli = yargs(yargsInput)
  .scriptName(scriptName)
  .version(version)
  .alias('version', 'v')
  .usage('Usage: $0 [--org <organization> | --user <username>] [options]\n\nOmit --org and --user to auto-detect the GitHub owner from local repositories or the target directory name.')
  .option('org', {
    alias: 'o',
    type: 'string',
    describe: 'GitHub organization name or URL',
    example: 'github.com/deep-assistant'
  })
  .option('user', {
    alias: 'u',
    type: 'string',
    describe: 'GitHub username or URL',
    example: 'github.com/konard'
  })
  .option('token', {
    alias: 't',
    type: 'string',
    describe: 'GitHub personal access token (optional for public repos)',
    default: process.env.GITHUB_TOKEN
  })
  .option('ssh', {
    alias: 's',
    type: 'boolean',
    describe: 'Use SSH URLs for cloning (requires SSH key setup)',
    default: false
  })
  .option('dir', {
    alias: 'd',
    type: 'string',
    describe: 'Target directory for repositories',
    default: process.cwd()
  })
  .option('threads', {
    alias: 'j',
    type: 'number',
    describe: 'Number of concurrent operations (default: 8)',
    default: 8
  })
  .option('single-thread', {
    type: 'boolean',
    describe: 'Run operations sequentially (equivalent to --threads 1)',
    default: false
  })
  .option('live-updates', {
    type: 'boolean',
    describe: 'Enable live in-place status updates (default: true, use --no-live-updates to disable)',
    default: true
  })
  .option('delete', {
    type: 'boolean',
    describe: 'Delete all cloned repositories (skips repos with uncommitted changes)',
    default: false
  })
  .option('pull-from-default', {
    type: 'boolean',
    describe: 'Pull changes from the default branch (main/master) into the current branch if behind',
    default: false
  })
  .option('switch-to-default', {
    type: 'boolean',
    describe: 'Switch to the default branch (main/master) in each repository',
    default: false
  })
  .option('pull-changes-to-fork', {
    type: 'boolean',
    describe: 'Update forks with changes from their parent repositories (upstream sync)',
    default: false
  })
  .check((argv) => {
    if (isHelpOrVersionRequest) {
      return true
    }

    const explicitThreads = readThreadOption(rawArgs)
    const threads = explicitThreads === undefined ? argv.threads : explicitThreads

    if (argv.org && argv.user) {
      throw new Error('You cannot specify both --org and --user')
    }
    if (!Number.isFinite(threads)) {
      throw new Error('Thread count must be a number')
    }
    if (threads < 1) {
      throw new Error('Thread count must be at least 1')
    }
    if (argv['single-thread'] && explicitThreads !== undefined) {
      throw new Error('Cannot specify both --single-thread and --threads')
    }
    if (argv['pull-from-default'] && argv['switch-to-default']) {
      throw new Error('Cannot specify both --pull-from-default and --switch-to-default')
    }
    if (argv['pull-changes-to-fork'] && argv['switch-to-default']) {
      throw new Error('Cannot specify both --pull-changes-to-fork and --switch-to-default')
    }
    if (argv['pull-changes-to-fork'] && argv['pull-from-default']) {
      throw new Error('Cannot specify both --pull-changes-to-fork and --pull-from-default')
    }
    return true
  })
  .help('h')
  .alias('h', 'help')
  .example('$0', 'Auto-detect GitHub owner from local repositories or directory name')
  .example('$0 --org deep-assistant', 'Sync all repositories from deep-assistant organization')
  .example('$0 --user konard', 'Sync all repositories from konard user account')
  .example('$0 --user github.com/konard', 'Sync all repositories from a GitHub URL owner')
  .example('$0 --org myorg --ssh --dir ./repos', 'Clone using SSH to ./repos directory')
  .example('$0 --user konard --threads 5', 'Use 5 concurrent operations')
  .example('$0 --user konard --single-thread', 'Run operations sequentially')
  .example('$0 --user konard -j 16', 'Use 16 concurrent operations (alias for --threads)')
  .example('$0 --user konard --no-live-updates', 'Disable live updates for terminal history preservation')
  .example('$0 --user konard --delete', 'Delete all cloned repositories (with confirmation)')
  .example('$0 --user konard --pull-from-default', 'Pull from default branch to current branch when behind')
  .example('$0 --user konard --switch-to-default', 'Switch all repositories to their default branch')
  .example('$0 --user konard --pull-changes-to-fork', 'Sync forked repositories with their upstream repositories')

const argv = cli.argv
const explicitThreads = readThreadOption(rawArgs)

if (explicitThreads !== undefined) {
  argv.threads = explicitThreads
}

if (isHelpRequest) {
  console.log(await cli.getHelp())
  process.exit(0)
}

// Import sync dependencies only after standalone CLI requests are handled.
const { Octokit } = await use('@octokit/rest@22.0.0')
const { default: git } = await use('simple-git@3.28.0')
const fs = await use('fs-extra@11.3.0')
const { syncForkWithUpstream } = await import('./fork-sync.mjs')
const {
  getGhToken,
  getReposFromGhCli,
  getOrganizationRepos,
  getUserRepos
} = await import('./github-repositories.mjs')

function createGit(baseDir) {
  const simpleGit = git(baseDir)
  return typeof simpleGit.timeout === 'function'
    ? simpleGit.timeout({ block: DEFAULTS.GIT_TIMEOUT_MS })
    : simpleGit
}

async function directoryExists(dirPath) {
  try {
    const stats = await statPath(dirPath)
    return stats.isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function getDefaultBranch(simpleGit) {
  try {
    // First try to get the default branch from the remote
    const remotes = await simpleGit.getRemotes(true)
    if (remotes.length > 0) {
      const remoteName = remotes[0].name || 'origin'

      // Try to get symbolic ref from remote HEAD
      try {
        const remoteHead = await simpleGit.raw(['symbolic-ref', `refs/remotes/${remoteName}/HEAD`])
        const defaultBranch = remoteHead.trim().replace(`refs/remotes/${remoteName}/`, '')
        if (defaultBranch) {
          return defaultBranch
        }
      } catch (error) {
        // Fallback: set the remote HEAD and try again
        try {
          await simpleGit.raw(['remote', 'set-head', remoteName, '--auto'])
          const remoteHead = await simpleGit.raw(['symbolic-ref', `refs/remotes/${remoteName}/HEAD`])
          const defaultBranch = remoteHead.trim().replace(`refs/remotes/${remoteName}/`, '')
          if (defaultBranch) {
            return defaultBranch
          }
        } catch (fallbackError) {
          // Continue to manual detection
        }
      }
    }

    // Fallback: check common default branch names
    const branches = await simpleGit.branch(['-r'])
    const remoteBranches = branches.all.filter(branch => branch.includes('/'))

    // Look for main or master in remote branches
    const mainBranch = remoteBranches.find(branch => branch.endsWith('/main'))
    if (mainBranch) {
      return 'main'
    }

    const masterBranch = remoteBranches.find(branch => branch.endsWith('/master'))
    if (masterBranch) {
      return 'master'
    }

    // If no common defaults found, use the first remote branch
    if (remoteBranches.length > 0) {
      return remoteBranches[0].split('/').pop()
    }

    // Final fallback: assume main
    return 'main'
  } catch (error) {
    // Default fallback
    return 'main'
  }
}

async function getPrimaryRemoteName(simpleGit) {
  const remotes = await simpleGit.getRemotes(true)
  return remotes[0]?.name || 'origin'
}

async function repositoryHasCommits(simpleGit) {
  try {
    await simpleGit.raw(['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

async function getCurrentBranchName(simpleGit) {
  try {
    const currentBranch = await simpleGit.revparse(['--abbrev-ref', 'HEAD'])
    return currentBranch.trim()
  } catch {
    const currentBranch = await simpleGit.raw(['symbolic-ref', '--short', 'HEAD'])
    return currentBranch.trim()
  }
}

async function getRemoteBranchNames(simpleGit) {
  const branches = await simpleGit.branch(['-r'])
  const remoteBranches = branches.all
    .map(branch => branch.trim())
    .filter(branch => branch && branch.includes('/') && !branch.includes('HEAD ->'))
    .map(branch => branch.slice(branch.indexOf('/') + 1))

  return Array.from(new Set(remoteBranches))
}

async function pullRepositoryWithoutLocalCommits(repoName, simpleGit, statusDisplay) {
  const remoteBranches = await getRemoteBranchNames(simpleGit)

  if (remoteBranches.length === 0) {
    statusDisplay.updateRepo(repoName, 'success', 'Successfully pulled (empty repository)')
    return { success: true, type: 'pulled_empty' }
  }

  statusDisplay.updateRepo(repoName, 'pulling', 'Detecting default branch...')
  const detectedDefaultBranch = await getDefaultBranch(simpleGit)
  const defaultBranch = remoteBranches.includes(detectedDefaultBranch)
    ? detectedDefaultBranch
    : remoteBranches[0]

  const currentBranchName = await getCurrentBranchName(simpleGit)

  if (currentBranchName !== defaultBranch) {
    statusDisplay.updateRepo(repoName, 'pulling', `Switching to ${defaultBranch}...`)
    try {
      await simpleGit.checkout(defaultBranch)
    } catch {
      await simpleGit.checkoutBranch(defaultBranch, `origin/${defaultBranch}`)
    }
  }

  statusDisplay.updateRepo(repoName, 'pulling', `Pulling ${defaultBranch}...`)
  await simpleGit.pull(await getPrimaryRemoteName(simpleGit), defaultBranch)
  statusDisplay.updateRepo(repoName, 'success', `Successfully pulled ${defaultBranch}`)
  return { success: true, type: 'pulled_default', details: { defaultBranch } }
}

async function switchToDefaultBranch(repoName, targetDir, statusDisplay) {
  try {
    statusDisplay.updateRepo(repoName, 'checking', 'Checking status...')
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = createGit(repoPath)

    const status = await simpleGit.status()
    if (status.files.length > 0) {
      statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
      return { success: true, type: 'uncommitted' }
    }

    statusDisplay.updateRepo(repoName, 'pulling', 'Fetching all branches...')
    await simpleGit.fetch(['--all'])

    // Get current branch
    const currentBranchName = await getCurrentBranchName(simpleGit)

    // Get default branch
    statusDisplay.updateRepo(repoName, 'pulling', 'Detecting default branch...')
    const defaultBranch = await getDefaultBranch(simpleGit)
    const remoteName = await getPrimaryRemoteName(simpleGit)

    if (currentBranchName === defaultBranch) {
      // Already on default branch, but still pull latest changes
      statusDisplay.updateRepo(repoName, 'pulling', `Already on ${defaultBranch}, pulling latest changes...`)
      await simpleGit.pull(remoteName, defaultBranch)
      statusDisplay.updateRepo(repoName, 'success', `Already on default branch ${defaultBranch} and pulled latest changes`)
      return { success: true, type: 'already_on_default', details: { defaultBranch } }
    }

    // Switch to default branch
    statusDisplay.updateRepo(repoName, 'pulling', `Switching to ${defaultBranch}...`)
    try {
      await simpleGit.checkout(defaultBranch)
    } catch (checkoutError) {
      // Try to create and checkout the branch if it doesn't exist locally
      statusDisplay.updateRepo(repoName, 'pulling', `Creating local ${defaultBranch} branch...`)
      try {
        await simpleGit.checkoutBranch(defaultBranch, `${remoteName}/${defaultBranch}`)
      } catch (createError) {
        statusDisplay.updateRepo(repoName, 'failed', `Could not switch to ${defaultBranch}: ${createError.message}`)
        return { success: false, type: 'switch_failed', error: createError.message, details: { defaultBranch } }
      }
    }

    // After switching to default branch, always pull the latest changes.
    statusDisplay.updateRepo(repoName, 'pulling', `Pulling latest changes from ${remoteName}/${defaultBranch}...`)
    await simpleGit.pull(remoteName, defaultBranch)
    statusDisplay.updateRepo(repoName, 'success', `Switched from ${currentBranchName} to ${defaultBranch} and pulled latest changes`)
    return { success: true, type: 'switched_to_default', details: { from: currentBranchName, to: defaultBranch } }
  } catch (error) {
    statusDisplay.updateRepo(repoName, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'switch', error: error.message }
  }
}

async function pullRepository(repoName, targetDir, statusDisplay, pullFromDefault = false) {
  try {
    statusDisplay.updateRepo(repoName, 'pulling', 'Checking status...')
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = createGit(repoPath)

    const status = await simpleGit.status()
    if (status.files.length > 0) {
      statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
      return { success: true, type: 'uncommitted' }
    }

    statusDisplay.updateRepo(repoName, 'pulling', 'Fetching all branches...')
    await simpleGit.fetch(['--all'])

    if (!(await repositoryHasCommits(simpleGit))) {
      return await pullRepositoryWithoutLocalCommits(repoName, simpleGit, statusDisplay)
    }

    if (pullFromDefault) {
      // Get current branch
      const currentBranchName = await getCurrentBranchName(simpleGit)

      // Get default branch
      statusDisplay.updateRepo(repoName, 'pulling', 'Detecting default branch...')
      const defaultBranch = await getDefaultBranch(simpleGit)

      if (currentBranchName !== defaultBranch) {
        // Attempt to merge from default branch
        statusDisplay.updateRepo(repoName, 'pulling', `Merging changes from ${defaultBranch}...`)
        try {
          const remoteName = await getPrimaryRemoteName(simpleGit)
          const remoteDefaultBranch = `${remoteName}/${defaultBranch}`

          // Check if remote branch exists
          const branches = await simpleGit.branch(['-r'])
          const hasRemoteDefault = branches.all.some(branch => branch.includes(remoteDefaultBranch))

          if (hasRemoteDefault) {
            // Attempt to merge - let git decide what to do
            try {
              const result = await simpleGit.merge([remoteDefaultBranch])

              // Check merge result - simple-git returns an object with changes info
              const hasChanges = (result?.files?.length > 0) ||
                                (result?.summary?.changes > 0) ||
                                (result?.summary?.insertions > 0) ||
                                (result?.summary?.deletions > 0)

              const isAlreadyUpToDate = !hasChanges

              if (isAlreadyUpToDate) {
                statusDisplay.updateRepo(repoName, 'success', `Already up to date with ${defaultBranch}`)
                return { success: true, type: 'up_to_date_with_default', details: { defaultBranch, currentBranch: currentBranchName } }
              } else {
                // Successful merge with changes, now push the changes
                statusDisplay.updateRepo(repoName, 'pulling', `Pushing merged changes...`)
                try {
                  await simpleGit.push()
                  statusDisplay.updateRepo(repoName, 'success', `Successfully merged ${defaultBranch} into ${currentBranchName}`)
                  return { success: true, type: 'merged_from_default', details: { from: defaultBranch, to: currentBranchName } }
                } catch (pushError) {
                  statusDisplay.updateRepo(repoName, 'success', `Merged ${defaultBranch} into ${currentBranchName} (push failed: ${pushError.message})`)
                  return { success: true, type: 'merged_from_default', details: { from: defaultBranch, to: currentBranchName, pushError: pushError.message } }
                }
              }
            } catch (mergeError) {
              // Merge conflict or other merge error
              statusDisplay.updateRepo(repoName, 'failed', `Merge conflict with ${defaultBranch}: ${mergeError.message}`)
              return { success: false, type: 'merge_conflict', error: mergeError.message, details: { from: defaultBranch, to: currentBranchName } }
            }
          } else {
            statusDisplay.updateRepo(repoName, 'success', `Remote ${defaultBranch} not found, pulling current branch`)
            await simpleGit.pull()
            return { success: true, type: 'pulled' }
          }
        } catch (error) {
          // Fall back to regular pull if default branch operations fail
          statusDisplay.updateRepo(repoName, 'pulling', 'Falling back to regular pull...')
          await simpleGit.pull()
          statusDisplay.updateRepo(repoName, 'success', 'Successfully pulled (fallback)')
          return { success: true, type: 'pulled' }
        }
      } else {
        // On default branch, just pull normally
        statusDisplay.updateRepo(repoName, 'pulling', `Pulling ${defaultBranch} (current branch)...`)
        await simpleGit.pull()
        statusDisplay.updateRepo(repoName, 'success', `Successfully pulled ${defaultBranch}`)
        return { success: true, type: 'pulled_default' }
      }
    } else {
      // Standard pull behavior
      statusDisplay.updateRepo(repoName, 'pulling', 'Pulling changes...')
      await simpleGit.pull()
      statusDisplay.updateRepo(repoName, 'success', 'Successfully pulled')
      return { success: true, type: 'pulled' }
    }
  } catch (error) {
    statusDisplay.updateRepo(repoName, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'pull', error: error.message }
  }
}

async function cloneRepository(repo, targetDir, useSsh, statusDisplay) {
  try {
    statusDisplay.updateRepo(repo.name, 'cloning', 'Cloning...')
    const simpleGit = createGit(targetDir)

    // Use SSH if requested and available, fallback to HTTPS
    const cloneUrl = useSsh && repo.ssh_url ? repo.ssh_url : repo.clone_url
    await simpleGit.clone(cloneUrl, repo.name)

    statusDisplay.updateRepo(repo.name, 'cloning', 'Fetching all branches...')
    const repoPath = path.join(targetDir, repo.name)
    const repoGit = createGit(repoPath)
    await repoGit.fetch(['--all'])

    statusDisplay.updateRepo(repo.name, 'success', 'Successfully cloned')
    return { success: true, type: 'cloned' }
  } catch (error) {
    statusDisplay.updateRepo(repo.name, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'clone', error: error.message }
  }
}

async function deleteRepository(repoName, targetDir, statusDisplay) {
  try {
    const repoPath = path.join(targetDir, repoName)

    // Check if directory exists
    if (!(await directoryExists(repoPath))) {
      statusDisplay.updateRepo(repoName, 'skipped', 'Not found locally')
      return { success: true, type: 'skipped' }
    }

    // Check for uncommitted changes
    statusDisplay.updateRepo(repoName, 'checking', 'Checking for uncommitted changes...')
    const simpleGit = createGit(repoPath)

    try {
      const status = await simpleGit.status()
      if (status.files.length > 0) {
        statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
        return { success: true, type: 'uncommitted' }
      }
    } catch (error) {
      // If not a git repository, skip it
      statusDisplay.updateRepo(repoName, 'skipped', 'Not a git repository')
      return { success: true, type: 'skipped' }
    }

    // Delete the repository
    statusDisplay.updateRepo(repoName, 'deleting', 'Deleting repository...')
    await fs.remove(repoPath)
    statusDisplay.updateRepo(repoName, 'success', 'Successfully deleted')
    return { success: true, type: 'deleted' }
  } catch (error) {
    statusDisplay.updateRepo(repoName, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'delete', error: error.message }
  }
}

// Process repository (either pull or clone)
async function processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault = false, switchToDefault = false, pullChangesToFork = false) {
  const repoPath = path.join(targetDir, repo.name)
  const exists = await directoryExists(repoPath)

  // Check if private repo without token
  if (repo.private && !token && !exists) {
    statusDisplay.updateRepo(repo.name, 'skipped', 'Private repo, no token provided')
    return { success: true, type: 'skipped' }
  }

  if (pullChangesToFork && (!repo.fork || !repo.parent)) {
    statusDisplay.updateRepo(repo.name, 'skipped', repo.fork ? 'Fork parent unavailable' : 'Not a fork')
    return { success: true, type: repo.fork ? 'missing_parent' : 'not_fork' }
  }

  if (exists) {
    if (pullChangesToFork) {
      return await syncForkWithUpstream(repo, targetDir, { useSsh, statusDisplay, gitFactory: createGit })
    } else if (switchToDefault) {
      return await switchToDefaultBranch(repo.name, targetDir, statusDisplay)
    } else {
      return await pullRepository(repo.name, targetDir, statusDisplay, pullFromDefault)
    }
  } else {
    const cloneResult = await cloneRepository(repo, targetDir, useSsh, statusDisplay)
    if (pullChangesToFork && cloneResult.success) {
      return await syncForkWithUpstream(repo, targetDir, { useSsh, statusDisplay, gitFactory: createGit })
    }
    return cloneResult
  }
}

async function main() {
  let { org, user, token, ssh: useSsh, dir: targetDir, threads, 'single-thread': singleThread, 'live-updates': liveUpdates, delete: deleteMode, 'pull-from-default': pullFromDefault, 'switch-to-default': switchToDefault, 'pull-changes-to-fork': pullChangesToFork } = argv

  if (org) {
    org = normalizeExplicitTarget(org, 'organization')
  }

  if (user) {
    user = normalizeExplicitTarget(user, 'username')
  }

  // If no token provided, try to get it from gh CLI
  if (!token || token === undefined) {
    const ghToken = await getGhToken()
    if (ghToken) {
      token = ghToken
      log('cyan', '🔑 Using GitHub token from gh CLI')
    }
  }

  // Ensure target directory exists before auto-detection inspects it
  await fs.ensureDir(targetDir)

  if (!org && !user) {
    const detectedTarget = await resolveAutoTarget({
      targetDir,
      gitFactory: createGit,
      token,
      Octokit,
      askConfirmation,
      askQuestion,
      log
    })
    org = detectedTarget.org
    user = detectedTarget.user
  }

  const target = org || user
  const targetType = org ? 'organization' : 'user'

  // Determine concurrency limit: single-thread overrides threads setting
  const concurrencyLimit = singleThread ? 1 : threads

  if (deleteMode) {
    log('red', `🗑️  Starting ${target} ${targetType} repository deletion...`)
    log('cyan', `📁 Target directory: ${targetDir}`)
    log('cyan', `⚡ Concurrency: ${concurrencyLimit} ${concurrencyLimit === 1 ? 'thread (sequential)' : 'threads (parallel)'}`)

    // Confirmation prompt
    const confirmed = await askConfirmation(`⚠️  Are you sure you want to delete all repositories from ${targetDir}? (y/N): `)
    if (!confirmed) {
      log('yellow', '✖️  Operation cancelled')
      process.exit(0)
    }
  } else {
    log('blue', `🚀 Starting ${target} ${targetType} repository sync...`)
    log('cyan', `📁 Target directory: ${targetDir}`)
    log('cyan', `🔗 Using ${useSsh ? 'SSH' : 'HTTPS'} for cloning`)
    if (pullFromDefault) {
      log('cyan', `🔀 Pull from default branch: enabled`)
    }
    if (switchToDefault) {
      log('cyan', `🔄 Switch to default branch: enabled`)
    }
    if (pullChangesToFork) {
      log('cyan', `🍴 Pull changes to fork: enabled`)
    }
    log('cyan', `⚡ Concurrency: ${concurrencyLimit} ${concurrencyLimit === 1 ? 'thread (sequential)' : 'threads (parallel)'}`)
  }

  // Try to get repositories using gh CLI first (includes private repos)
  let repos = await getReposFromGhCli(org, user)

  if (repos) {
    log('cyan', '📋 Using gh CLI to fetch repositories (includes private repos)')
  } else {
    // Fallback to API calls
    log('cyan', '📋 Using GitHub API to fetch repositories')
    repos = org
      ? await getOrganizationRepos(org, token, Octokit, log)
      : await getUserRepos(user, token, Octokit, log)
  }

  // Initialize status display
  const statusDisplay = new StatusDisplay(liveUpdates, concurrencyLimit)

  // Add all repositories to status display
  for (const repo of repos) {
    statusDisplay.addRepo(repo.name)
  }

  // Sort repositories alphabetically by name
  repos.sort((a, b) => a.name.localeCompare(b.name))

  // Process all repositories with configurable concurrency
  const results = []

  // Start render loop at 10 FPS for dynamic updates
  let renderInterval
  if (statusDisplay.useInPlaceUpdates) {
    renderInterval = setInterval(() => {
      statusDisplay.render()
    }, 100) // 100ms = 10 FPS
  }

  try {
    if (concurrencyLimit === 1) {
      // Sequential processing for single-thread mode
      for (const repo of repos) {
        const result = deleteMode
          ? await deleteRepository(repo.name, targetDir, statusDisplay)
          : await processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault, switchToDefault, pullChangesToFork)
        results.push(result)
      }
    } else {
      // Concurrent processing with worker pool pattern
      let activeWorkers = 0
      let repoIndex = 0
      const resultsMap = new Map()

      // Create a promise that resolves when all repos are processed
      await new Promise((resolve) => {
        const processNext = async () => {
          // If we've processed all repos and no workers are active, we're done
          if (repoIndex >= repos.length && activeWorkers === 0) {
            resolve()
            return
          }

          // Start new workers up to the concurrency limit
          while (activeWorkers < concurrencyLimit && repoIndex < repos.length) {
            const currentIndex = repoIndex
            const repo = repos[currentIndex]
            repoIndex++
            activeWorkers++

            // Process repository asynchronously
            const processPromise = deleteMode
              ? deleteRepository(repo.name, targetDir, statusDisplay)
              : processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault, switchToDefault, pullChangesToFork)

            processPromise
              .then(result => {
                resultsMap.set(currentIndex, result)
                activeWorkers--
                processNext() // Try to start another worker
              })
              .catch(error => {
                // Handle unexpected errors
                resultsMap.set(currentIndex, {
                  success: false,
                  type: 'error',
                  error: error.message
                })
                statusDisplay.updateRepo(repo.name, 'failed', `Unexpected error: ${error.message}`)
                activeWorkers--
                processNext() // Try to start another worker
              })
          }
        }

        // Start initial workers
        processNext()
      })

      // Convert resultsMap to array in original order
      for (let i = 0; i < repos.length; i++) {
        results.push(resultsMap.get(i))
      }
    }
  } finally {
    // Stop render loop
    if (renderInterval) {
      clearInterval(renderInterval)
      // One final render to ensure everything is up to date
      statusDisplay.render()
    }
  }

  // Print final summary
  statusDisplay.printSummary()
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false
  }

  try {
    return realpathSync(process.argv[1]) === __filename
  } catch (error) {
    return path.resolve(process.argv[1]) === __filename
  }
}

if (isDirectExecution() && !isHelpOrVersionRequest) {
  main().catch(error => {
    log('red', `💥 Script failed: ${error.message}`)
    process.exit(1)
  })
}

export { StatusDisplay }
