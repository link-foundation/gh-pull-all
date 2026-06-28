import { execFileSync } from 'child_process'

export async function isGhInstalled() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export async function getGhToken() {
  try {
    if (!(await isGhInstalled())) {
      return null
    }

    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim()
  } catch {
    return null
  }
}

export async function getReposFromGhCli(org, user) {
  try {
    if (!(await isGhInstalled())) {
      return null
    }

    const target = org || user
    const output = execFileSync('gh', [
      'repo',
      'list',
      target,
      '--json',
      'name,isPrivate,url,sshUrl,updatedAt,isFork,parent',
      '--limit',
      '1000'
    ], { encoding: 'utf8', stdio: 'pipe' })
    const repos = JSON.parse(output)

    return repos.map(repo => ({
      name: repo.name,
      clone_url: `${repo.url}.git`,
      ssh_url: repo.sshUrl,
      html_url: repo.url,
      updated_at: repo.updatedAt,
      private: repo.isPrivate,
      fork: repo.isFork,
      parent: repo.parent
    }))
  } catch {
    return null
  }
}

function simplifyForkParent(parent) {
  if (!parent) {
    return null
  }

  return {
    name: parent.name,
    full_name: parent.full_name,
    clone_url: parent.clone_url,
    ssh_url: parent.ssh_url,
    default_branch: parent.default_branch,
    owner: parent.owner ? { login: parent.owner.login } : null
  }
}

function mapApiRepository(repo, parent = repo.parent) {
  return {
    name: repo.name,
    clone_url: repo.clone_url,
    ssh_url: repo.ssh_url,
    html_url: repo.html_url,
    updated_at: repo.updated_at,
    private: repo.private,
    fork: repo.fork,
    parent: simplifyForkParent(parent)
  }
}

async function getForkParentFromApi(octokit, owner, repoName) {
  try {
    const { data: repo } = await octokit.rest.repos.get({ owner, repo: repoName })
    return repo.parent || null
  } catch {
    return null
  }
}

async function mapApiRepositoriesWithParents(octokit, owner, repos) {
  const mappedRepos = []
  for (const repo of repos) {
    const parent = repo.fork && !repo.parent
      ? await getForkParentFromApi(octokit, owner, repo.name)
      : repo.parent
    mappedRepos.push(mapApiRepository(repo, parent))
  }
  return mappedRepos
}

export async function getOrganizationRepos(org, token, Octokit, log) {
  try {
    log('blue', `🔍 Fetching repositories from ${org} organization...`)
    const octokit = new Octokit({ auth: token, baseUrl: 'https://api.github.com' })
    const { data: repos } = await octokit.rest.repos.listForOrg({
      org,
      type: 'all',
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    })

    log('green', `✅ Found ${repos.length} repositories`)
    return await mapApiRepositoriesWithParents(octokit, org, repos)
  } catch (error) {
    const apiUrl = `https://api.github.com/orgs/${org}/repos`
    logFetchError(error, 'Organization', org, apiUrl, token, log)
  }
}

export async function getUserRepos(username, token, Octokit, log) {
  try {
    log('blue', `🔍 Fetching repositories from ${username} user account...`)
    const octokit = new Octokit({ auth: token, baseUrl: 'https://api.github.com' })
    const { data: repos } = await octokit.rest.repos.listForUser({
      username,
      type: 'all',
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    })

    log('green', `✅ Found ${repos.length} repositories`)
    return await mapApiRepositoriesWithParents(octokit, username, repos)
  } catch (error) {
    const apiUrl = `https://api.github.com/users/${username}/repos`
    logFetchError(error, 'User', username, apiUrl, token, log)
  }
}

function logFetchError(error, targetType, target, apiUrl, token, log) {
  if (error.status === 404) {
    log('red', `❌ ${targetType} '${target}' not found or not accessible`)
    log('yellow', `   API URL: ${apiUrl}`)
  } else if (error.status === 401) {
    log('red', '❌ Authentication failed. Please provide a valid GitHub token')
    log('yellow', `   API URL: ${apiUrl}`)
  } else {
    log('red', `❌ Failed to fetch repositories from: ${apiUrl}`)
    log('red', `   Error: ${error.message}`)
    if ((error.message || '').includes('Unable to connect')) {
      log('yellow', '💡 Please check your internet connection')
      log('yellow', `   You can test by visiting: ${apiUrl}`)
    }
  }
  if (!token) {
    log('yellow', '💡 Try providing a GitHub personal access token with --token flag')
    log('yellow', '   Visit: https://github.com/settings/tokens')
  }
  process.exit(1)
}
