// Helpers for working with all active git worktrees of a repository.
//
// `git worktree list --porcelain` is the only interface that reports every
// checkout attached to a repository, including linked worktrees stored outside
// the repository directory. Operations that pull data or destroy data must
// consider all of them, not only the main worktree.
// See https://git-scm.com/docs/git-worktree for the porcelain format.
import path from 'path'
import { existsSync } from 'fs'

// Parse the output of `git worktree list --porcelain` into worktree records.
export function parseWorktreeList(output) {
  const entries = []
  let current = null

  const pushCurrent = () => {
    if (current) {
      entries.push(current)
      current = null
    }
  }

  for (const rawLine of String(output || '').split('\n')) {
    const line = rawLine.trim()

    if (line === '') {
      pushCurrent()
      continue
    }

    const separatorIndex = line.indexOf(' ')
    const keyword = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
    const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).trim()

    if (keyword === 'worktree') {
      pushCurrent()
      current = {
        path: value,
        head: null,
        branch: null,
        isBare: false,
        isDetached: false,
        isLocked: false,
        isPrunable: false
      }
      continue
    }

    if (!current) {
      continue
    }

    switch (keyword) {
      case 'HEAD':
        current.head = value
        break
      case 'branch':
        current.branch = value.replace(/^refs\/heads\//, '')
        break
      case 'bare':
        current.isBare = true
        break
      case 'detached':
        current.isDetached = true
        break
      case 'locked':
        current.isLocked = true
        current.lockReason = value || null
        break
      case 'prunable':
        current.isPrunable = true
        current.prunableReason = value || null
        break
      default:
        break
    }
  }

  pushCurrent()

  // Git always lists the main worktree first.
  return entries.map((entry, index) => ({ ...entry, isMain: index === 0 }))
}

// List every worktree attached to the repository handled by `simpleGit`.
export async function listWorktrees(simpleGit) {
  try {
    const output = await simpleGit.raw(['worktree', 'list', '--porcelain'])
    return parseWorktreeList(output)
  } catch (error) {
    // Repositories that are not git repositories (or very old git versions)
    // behave like a single implicit worktree.
    return []
  }
}

// List worktrees other than the main one, skipping bare and pruned entries.
export async function listLinkedWorktrees(simpleGit) {
  const worktrees = await listWorktrees(simpleGit)
  return worktrees.filter(worktree => !worktree.isMain && !worktree.isBare && !worktree.isPrunable)
}

export function worktreeLabel(worktreePath) {
  return path.basename(worktreePath) || worktreePath
}

export function isPathInside(childPath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function worktreeExists(worktree) {
  return existsSync(worktree.path)
}

// Read uncommitted-change state of a single worktree.
export async function getWorktreeStatus(worktree, gitFactory) {
  if (!worktreeExists(worktree)) {
    return { worktree, exists: false, hasUncommittedChanges: false }
  }

  try {
    const status = await gitFactory(worktree.path).status()
    return {
      worktree,
      exists: true,
      hasUncommittedChanges: status.files.length > 0,
      fileCount: status.files.length
    }
  } catch (error) {
    return { worktree, exists: true, hasUncommittedChanges: false, error: error.message }
  }
}

export async function collectWorktreeStatuses(worktrees, gitFactory) {
  const statuses = []
  for (const worktree of worktrees) {
    statuses.push(await getWorktreeStatus(worktree, gitFactory))
  }
  return statuses
}

// Names of worktrees that contain uncommitted changes.
export async function findDirtyWorktrees(worktrees, gitFactory) {
  const statuses = await collectWorktreeStatuses(worktrees, gitFactory)
  return statuses.filter(status => status.hasUncommittedChanges).map(status => status.worktree)
}

export async function getUpstreamBranch(simpleGit) {
  try {
    const upstream = await simpleGit.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    return upstream.trim() || null
  } catch (error) {
    return null
  }
}

// Find the worktree (if any) that currently has `branchName` checked out.
export function findWorktreeForBranch(worktrees, branchName) {
  return worktrees.find(worktree => worktree.branch === branchName) || null
}

// Fetch and pull a single linked worktree.
//
// `pullDefaultIntoCurrent` mirrors the `--pull-from-default` behaviour and is
// applied per worktree when provided.
export async function pullWorktree(worktree, options) {
  const { gitFactory, onProgress = () => {}, pullDefaultIntoCurrent = null } = options
  const label = worktreeLabel(worktree.path)
  const base = { label, path: worktree.path, branch: worktree.branch }

  if (!worktreeExists(worktree)) {
    return { ...base, success: true, type: 'missing', message: `Worktree ${label} is missing on disk, skipped` }
  }

  const simpleGit = gitFactory(worktree.path)

  try {
    const status = await simpleGit.status()
    if (status.files.length > 0) {
      return { ...base, success: true, type: 'uncommitted', message: `Worktree ${label} has uncommitted changes, skipped` }
    }

    if (worktree.isDetached || !worktree.branch) {
      return { ...base, success: true, type: 'detached', message: `Worktree ${label} has a detached HEAD, skipped` }
    }

    const upstream = await getUpstreamBranch(simpleGit)
    if (!upstream) {
      return { ...base, success: true, type: 'no_upstream', message: `Worktree ${label} has no upstream branch, skipped` }
    }

    if (pullDefaultIntoCurrent) {
      const result = await pullDefaultIntoCurrent(simpleGit, message => onProgress(`${label}: ${message}`))
      return { ...base, ...result }
    }

    onProgress(`Pulling ${worktree.branch} in worktree ${label}...`)
    await simpleGit.pull()
    return { ...base, success: true, type: 'pulled', message: `Pulled ${worktree.branch} in worktree ${label}` }
  } catch (error) {
    return { ...base, success: false, type: 'failed', error: error.message, message: `Worktree ${label} failed: ${error.message}` }
  }
}

export async function pullWorktrees(worktrees, options) {
  const results = []
  for (const worktree of worktrees) {
    results.push(await pullWorktree(worktree, options))
  }
  return results
}

const PULLED_TYPES = new Set(['pulled', 'pulled_default', 'merged_from_default', 'up_to_date_with_default'])

export function summarizeWorktreeResults(results) {
  const summary = { total: results.length, pulled: 0, uncommitted: 0, skipped: 0, failed: 0 }

  for (const result of results) {
    if (!result.success) {
      summary.failed++
    } else if (PULLED_TYPES.has(result.type)) {
      summary.pulled++
    } else if (result.type === 'uncommitted') {
      summary.uncommitted++
    } else {
      summary.skipped++
    }
  }

  return summary
}

function pluralizeWorktrees(count) {
  return count === 1 ? '1 worktree' : `${count} worktrees`
}

// Build the repository level status shown for a worktree-aware operation.
export function buildWorktreeStatusMessage(mainResult, linkedResults) {
  const mainPulled = mainResult.success && mainResult.type !== 'uncommitted'
  const mainUncommitted = mainResult.type === 'uncommitted'
  const summary = summarizeWorktreeResults(linkedResults)
  const totalWorktrees = summary.total + 1
  const pulledCount = summary.pulled + (mainPulled ? 1 : 0)

  if (!mainResult.success || summary.failed > 0) {
    const failure = !mainResult.success
      ? mainResult.error || 'main worktree failed'
      : linkedResults.find(result => !result.success)?.message
    return { status: 'failed', type: 'pull', message: `Error: ${failure}` }
  }

  if (pulledCount === 0 && (mainUncommitted || summary.uncommitted > 0)) {
    return {
      status: 'uncommitted',
      type: 'uncommitted',
      message: `Has uncommitted changes in all ${pluralizeWorktrees(totalWorktrees)}, skipped`
    }
  }

  const notes = []
  if (mainUncommitted) {
    notes.push('main worktree has uncommitted changes')
  }
  if (summary.uncommitted > 0) {
    notes.push(`${pluralizeWorktrees(summary.uncommitted)} with uncommitted changes`)
  }
  if (summary.skipped > 0) {
    notes.push(`${pluralizeWorktrees(summary.skipped)} skipped`)
  }

  const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : ''
  return {
    status: 'success',
    type: 'pulled',
    message: `Successfully pulled ${pulledCount} of ${pluralizeWorktrees(totalWorktrees)}${suffix}`
  }
}
