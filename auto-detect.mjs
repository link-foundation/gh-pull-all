import path from 'path'
import { readdir } from 'fs/promises'
import { execFileSync } from 'child_process'

export function isValidGitHubOwnerName(owner) {
  if (!owner || owner.length > 39) {
    return false
  }

  if (!/^[A-Za-z0-9-]+$/.test(owner)) {
    return false
  }

  if (owner.startsWith('-') || owner.endsWith('-')) {
    return false
  }

  return !owner.includes('--')
}

function normalizeGitHubHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '')
}

function ownerFromUrl(input) {
  try {
    const url = new URL(input)
    if (normalizeGitHubHost(url.hostname) !== 'github.com') {
      return null
    }

    const owner = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '')
    return isValidGitHubOwnerName(owner) ? owner : null
  } catch {
    return null
  }
}

function ownerFromScpLikeUrl(input) {
  const match = input.match(/^(?:[^@\s]+@)?github\.com[:/](.+)$/i)
  if (!match) {
    return null
  }

  const owner = match[1].split('/').filter(Boolean)[0] || ''
  return isValidGitHubOwnerName(owner) ? owner : null
}

export function parseGitHubOwner(input) {
  const value = String(input || '').trim()
  if (!value) {
    return null
  }

  if (isValidGitHubOwnerName(value)) {
    return value
  }

  const scpOwner = ownerFromScpLikeUrl(value)
  if (scpOwner) {
    return scpOwner
  }

  const urlOwner = ownerFromUrl(value)
  if (urlOwner) {
    return urlOwner
  }

  if (/^(?:www\.)?github\.com[/:]/i.test(value)) {
    const normalizedUrl = `https://${value.replace(/^github\.com:/i, 'github.com/')}`
    return ownerFromUrl(normalizedUrl)
  }

  return null
}

export function extractGitHubOwnerFromRemoteUrl(remoteUrl) {
  return parseGitHubOwner(remoteUrl)
}

export function normalizeExplicitTarget(input, optionName) {
  const owner = parseGitHubOwner(input)
  if (!owner) {
    throw new Error(`Invalid GitHub ${optionName}: ${input}. Use a name or GitHub URL like github.com/name.`)
  }

  return owner
}

async function readGitHubRemoteOwner(repoPath, gitFactory) {
  const simpleGit = gitFactory(repoPath)

  try {
    const isInsideWorkTree = (await simpleGit.raw(['rev-parse', '--is-inside-work-tree'])).trim()
    if (isInsideWorkTree !== 'true') {
      return null
    }

    const repoRoot = (await simpleGit.raw(['rev-parse', '--show-toplevel'])).trim()
    if (path.resolve(repoRoot) !== path.resolve(repoPath)) {
      return null
    }
  } catch {
    return null
  }

  const remotes = await simpleGit.getRemotes(true)
  const originRemote = remotes.find(remote => remote.name === 'origin')
  const orderedRemotes = originRemote
    ? [originRemote, ...remotes.filter(remote => remote.name !== 'origin')]
    : remotes

  for (const remote of orderedRemotes) {
    const urls = [remote.refs?.fetch, remote.refs?.push].filter(Boolean)
    for (const url of urls) {
      const owner = extractGitHubOwnerFromRemoteUrl(url)
      if (owner) {
        return { owner, remoteUrl: url }
      }
    }
  }

  return { owner: null, remoteUrl: null }
}

function ownerSummaryFromRepositories(gitRepositories) {
  const ownersByLogin = new Map()

  for (const repo of gitRepositories) {
    if (!repo.owner) {
      continue
    }

    const key = repo.owner.toLowerCase()
    const summary = ownersByLogin.get(key) || {
      owner: repo.owner,
      repositories: []
    }
    summary.repositories.push(repo.name)
    ownersByLogin.set(key, summary)
  }

  return Array.from(ownersByLogin.values())
}

export async function detectOwnerFromGitFolders(targetDir, gitFactory) {
  const resolvedTargetDir = path.resolve(targetDir)
  let entries

  try {
    entries = await readdir(resolvedTargetDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') {
      entries = []
    } else {
      throw error
    }
  }

  const directories = entries.filter(entry => entry.isDirectory())
  const gitRepositories = []

  for (const entry of directories) {
    const repoPath = path.join(resolvedTargetDir, entry.name)
    const remoteInfo = await readGitHubRemoteOwner(repoPath, gitFactory)

    if (!remoteInfo) {
      continue
    }

    gitRepositories.push({
      name: entry.name,
      path: repoPath,
      owner: remoteInfo.owner,
      remoteUrl: remoteInfo.remoteUrl
    })
  }

  const owners = ownerSummaryFromRepositories(gitRepositories)
  const unknownGitRepositories = gitRepositories
    .filter(repo => !repo.owner)
    .map(repo => repo.name)

  let reason = 'single-owner'
  let owner = null

  if (entries.length === 0) {
    reason = 'empty'
  } else if (gitRepositories.length === 0) {
    reason = 'no-git-repositories'
  } else if (unknownGitRepositories.length > 0) {
    reason = 'unknown-remotes'
  } else if (owners.length > 1) {
    reason = 'multiple-owners'
  } else if (owners.length === 1) {
    owner = owners[0].owner
  }

  return {
    targetDir: resolvedTargetDir,
    isEmpty: entries.length === 0,
    entriesCount: entries.length,
    gitRepositories,
    unknownGitRepositories,
    owners,
    owner,
    reason
  }
}

function normalizeAccountData(data) {
  if (!data?.login || !data?.type) {
    return null
  }

  return {
    login: data.login,
    kind: data.type === 'Organization' ? 'org' : 'user',
    label: data.type === 'Organization' ? 'organization' : 'user'
  }
}

function getGitHubAccountFromGhCli(owner) {
  try {
    const output = execFileSync('gh', ['api', `users/${owner}`], {
      encoding: 'utf8',
      stdio: 'pipe'
    })

    return normalizeAccountData(JSON.parse(output))
  } catch {
    return null
  }
}

export async function getGitHubAccount(owner, { token, Octokit }) {
  const parsedOwner = parseGitHubOwner(owner)
  if (!parsedOwner) {
    return null
  }

  const ghCliAccount = getGitHubAccountFromGhCli(parsedOwner)
  if (ghCliAccount) {
    return ghCliAccount
  }

  try {
    const octokit = new Octokit({
      auth: token,
      baseUrl: 'https://api.github.com'
    })
    const { data } = await octokit.rest.users.getByUsername({ username: parsedOwner })
    return normalizeAccountData(data)
  } catch {
    return null
  }
}

function targetFromAccount(account) {
  return account.kind === 'org'
    ? { org: account.login, user: null }
    : { org: null, user: account.login }
}

async function confirmAccount(account, source, { askConfirmation, log }) {
  log('cyan', `🔍 Auto-detected ${account.login} ${account.label} from ${source}`)
  const confirmed = await askConfirmation(`Use ${account.login} ${account.label}? (Y/n): `, true)

  if (confirmed) {
    return targetFromAccount(account)
  }

  log('yellow', 'Auto-detection rejected. Use --user <name> or --org <name> to skip detection next time.')
  return null
}

async function resolveOwner(owner, source, dependencies) {
  const account = await getGitHubAccount(owner, dependencies)
  if (!account) {
    dependencies.log('yellow', `GitHub account '${owner}' was not found or is not accessible.`)
    return null
  }

  return await confirmAccount(account, source, dependencies)
}

function formatOwnerSummaries(owners) {
  return owners
    .map(owner => `${owner.owner} (${owner.repositories.join(', ')})`)
    .join('; ')
}

async function promptForTarget(dependencies) {
  const { askQuestion, log, token, Octokit } = dependencies

  log('yellow', 'Please provide a GitHub user or organization name, or a URL like github.com/name.')

  while (true) {
    const answer = await askQuestion('GitHub user/organization: ')
    const owner = parseGitHubOwner(answer)

    if (!owner) {
      const message = 'No valid GitHub user or organization was provided. Use --user <name> or --org <name>.'
      if (!process.stdin.isTTY) {
        throw new Error(message)
      }
      log('yellow', message)
      continue
    }

    const account = await getGitHubAccount(owner, { token, Octokit })
    if (account) {
      return targetFromAccount(account)
    }

    const message = `GitHub account '${owner}' was not found or is not accessible.`
    if (!process.stdin.isTTY) {
      throw new Error(`${message} Use --user <name> or --org <name>.`)
    }

    log('yellow', message)
  }
}

export async function resolveAutoTarget(dependencies) {
  const { targetDir, gitFactory, log } = dependencies
  const detection = await detectOwnerFromGitFolders(targetDir, gitFactory)

  if (detection.reason === 'single-owner') {
    const target = await resolveOwner(
      detection.owner,
      `local git repositories in ${detection.targetDir}`,
      dependencies
    )
    if (target) {
      return target
    }
  } else if (detection.reason === 'multiple-owners') {
    log('yellow', `Auto-detection found repositories from multiple GitHub owners: ${formatOwnerSummaries(detection.owners)}.`)
  } else if (detection.reason === 'unknown-remotes') {
    log('yellow', `Auto-detection found git repositories without GitHub remotes: ${detection.unknownGitRepositories.join(', ')}.`)
  } else if (detection.reason === 'no-git-repositories') {
    log('yellow', `Auto-detection did not find git repositories in ${detection.targetDir}.`)
  }

  if (detection.reason === 'empty') {
    const folderName = path.basename(detection.targetDir)
    const owner = parseGitHubOwner(folderName)

    if (owner) {
      const target = await resolveOwner(
        owner,
        `empty directory name '${folderName}'`,
        dependencies
      )
      if (target) {
        return target
      }
    } else {
      log('yellow', `Directory name '${folderName}' is not a valid GitHub user or organization name.`)
    }
  }

  return await promptForTarget(dependencies)
}
