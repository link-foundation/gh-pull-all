import path from 'path'

function getParentOwnerLogin(parent) {
  return parent?.owner?.login || parent?.owner?.name || null
}

export function normalizeForkParent(parent) {
  if (!parent) {
    return null
  }

  const ownerLogin = getParentOwnerLogin(parent)
  const fullName = parent.full_name || parent.fullName || (
    ownerLogin && parent.name ? `${ownerLogin}/${parent.name}` : null
  )

  if (!fullName) {
    return null
  }

  const name = parent.name || fullName.split('/').pop()
  return {
    name,
    fullName,
    cloneUrl: parent.clone_url || parent.cloneUrl || `https://github.com/${fullName}.git`,
    sshUrl: parent.ssh_url || parent.sshUrl || `git@github.com:${fullName}.git`,
    defaultBranch: parent.default_branch || parent.defaultBranch || null
  }
}

function getUpstreamUrl(parentInfo, useSsh) {
  return useSsh && parentInfo.sshUrl ? parentInfo.sshUrl : parentInfo.cloneUrl
}

async function getCurrentBranchName(simpleGit) {
  try {
    return (await simpleGit.revparse(['--abbrev-ref', 'HEAD'])).trim()
  } catch {
    return (await simpleGit.raw(['symbolic-ref', '--short', 'HEAD'])).trim()
  }
}

async function getRemoteBranchNames(simpleGit, remoteName) {
  const branches = await simpleGit.branch(['-r'])
  const prefix = `${remoteName}/`
  return Array.from(new Set(branches.all
    .map(branch => branch.trim())
    .filter(branch => branch.startsWith(prefix) && !branch.includes('HEAD ->'))
    .map(branch => branch.slice(prefix.length))))
}

async function ensureUpstreamRemote(simpleGit, upstreamUrl) {
  const remotes = await simpleGit.getRemotes(true)
  const upstreamRemote = remotes.find(remote => remote.name === 'upstream')

  if (upstreamRemote) {
    await simpleGit.raw(['remote', 'set-url', 'upstream', upstreamUrl])
  } else {
    await simpleGit.addRemote('upstream', upstreamUrl)
  }
}

export async function getDefaultBranchFromRemote(simpleGit, remoteName, preferredBranch = null) {
  const remoteBranches = await getRemoteBranchNames(simpleGit, remoteName)

  if (preferredBranch && remoteBranches.includes(preferredBranch)) {
    return preferredBranch
  }

  for (const shouldSetHead of [false, true]) {
    try {
      if (shouldSetHead) {
        await simpleGit.raw(['remote', 'set-head', remoteName, '--auto'])
      }
      const remoteHead = await simpleGit.raw(['symbolic-ref', `refs/remotes/${remoteName}/HEAD`])
      const defaultBranch = remoteHead.trim().replace(`refs/remotes/${remoteName}/`, '')
      if (defaultBranch && remoteBranches.includes(defaultBranch)) {
        return defaultBranch
      }
    } catch {
      // Continue through deterministic fallbacks below.
    }
  }

  if (remoteBranches.includes('main')) {
    return 'main'
  }

  if (remoteBranches.includes('master')) {
    return 'master'
  }

  return remoteBranches[0] || preferredBranch || 'main'
}

async function checkoutForkBranch(simpleGit, branchName, originBranches) {
  const currentBranchName = await getCurrentBranchName(simpleGit)
  if (currentBranchName === branchName) {
    return
  }

  try {
    await simpleGit.checkout(branchName)
    return
  } catch {
    const startPoint = originBranches.includes(branchName)
      ? `origin/${branchName}`
      : `upstream/${branchName}`
    await simpleGit.checkoutBranch(branchName, startPoint)
  }
}

async function getHeadSha(simpleGit) {
  return (await simpleGit.revparse(['HEAD'])).trim()
}

function isMergeConflict(error) {
  return /conflict|CONFLICT|Automatic merge failed/i.test(error.message || '')
}

export async function syncForkWithUpstream(repo, targetDir, options) {
  const { useSsh = false, statusDisplay, gitFactory } = options
  const repoName = repo.name
  const parentInfo = normalizeForkParent(repo.parent)

  if (!repo.fork || !parentInfo) {
    statusDisplay.updateRepo(repoName, 'skipped', repo.fork ? 'Fork parent unavailable' : 'Not a fork')
    return { success: true, type: repo.fork ? 'missing_parent' : 'not_fork' }
  }

  try {
    statusDisplay.updateRepo(repoName, 'checking', 'Checking fork status...')
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = gitFactory(repoPath)

    const status = await simpleGit.status()
    if (status.files.length > 0) {
      statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
      return { success: true, type: 'uncommitted' }
    }

    statusDisplay.updateRepo(repoName, 'pulling', 'Setting up upstream remote...')
    await ensureUpstreamRemote(simpleGit, getUpstreamUrl(parentInfo, useSsh))

    statusDisplay.updateRepo(repoName, 'pulling', 'Fetching fork and upstream branches...')
    await simpleGit.fetch(['origin'])
    await simpleGit.fetch(['upstream'])

    const originBranches = await getRemoteBranchNames(simpleGit, 'origin')
    const upstreamBranch = await getDefaultBranchFromRemote(
      simpleGit,
      'upstream',
      parentInfo.defaultBranch
    )
    const upstreamBranches = await getRemoteBranchNames(simpleGit, 'upstream')

    if (!upstreamBranches.includes(upstreamBranch)) {
      statusDisplay.updateRepo(repoName, 'failed', 'No upstream default branch found')
      return { success: false, type: 'no_upstream_branch' }
    }

    statusDisplay.updateRepo(repoName, 'pulling', `Checking out ${upstreamBranch}...`)
    await checkoutForkBranch(simpleGit, upstreamBranch, originBranches)

    if (originBranches.includes(upstreamBranch)) {
      statusDisplay.updateRepo(repoName, 'pulling', `Pulling origin/${upstreamBranch}...`)
      await simpleGit.pull('origin', upstreamBranch)
    }

    const beforeMerge = await getHeadSha(simpleGit)
    statusDisplay.updateRepo(repoName, 'pulling', `Merging upstream/${upstreamBranch}...`)
    await simpleGit.merge([`upstream/${upstreamBranch}`])
    const afterMerge = await getHeadSha(simpleGit)

    if (beforeMerge === afterMerge && originBranches.includes(upstreamBranch)) {
      statusDisplay.updateRepo(repoName, 'success', `Already up to date with upstream/${upstreamBranch}`)
      return {
        success: true,
        type: 'up_to_date_with_upstream',
        details: { upstream: parentInfo.fullName, branch: upstreamBranch }
      }
    }

    statusDisplay.updateRepo(repoName, 'pulling', 'Pushing synchronized changes...')
    await simpleGit.push('origin', upstreamBranch)
    statusDisplay.updateRepo(repoName, 'success', `Successfully synced fork with upstream/${upstreamBranch}`)
    return {
      success: true,
      type: 'synced_with_upstream',
      details: { upstream: parentInfo.fullName, branch: upstreamBranch }
    }
  } catch (error) {
    const message = isMergeConflict(error)
      ? `Merge conflict with upstream: ${error.message}`
      : `Sync failed: ${error.message}`
    statusDisplay.updateRepo(repoName, 'failed', message)
    return { success: false, type: 'fork_sync', error: error.message }
  }
}
