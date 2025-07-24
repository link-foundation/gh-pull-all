#!/usr/bin/env bun

// Download use-m dynamically
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

// Import modern npm libraries using use-m
const { Octokit } = await use('@octokit/rest@latest')
const { default: git } = await use('simple-git@latest')
const fs = await use('fs-extra@latest')
const path = await use('path@latest')
const { default: yargs } = await use('yargs@latest')
const { hideBin } = await use('yargs@latest/helpers')

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

// Configure CLI arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [--org <organization> | --user <username>] [options]')
  .option('org', {
    alias: 'o',
    type: 'string',
    describe: 'GitHub organization name',
    example: 'deep-assistant'
  })
  .option('user', {
    alias: 'u',
    type: 'string',
    describe: 'GitHub username',
    example: 'konard'
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
  .check((argv) => {
    if (!argv.org && !argv.user) {
      throw new Error('You must specify either --org or --user')
    }
    if (argv.org && argv.user) {
      throw new Error('You cannot specify both --org and --user')
    }
    return true
  })
  .help('h')
  .alias('h', 'help')
  .example('$0 --org deep-assistant', 'Sync all repositories from deep-assistant organization')
  .example('$0 --user konard', 'Sync all repositories from konard user account')
  .example('$0 --org myorg --ssh --dir ./repos', 'Clone using SSH to ./repos directory')
  .argv

async function getOrganizationRepos(org, token) {
  try {
    log('blue', `🔍 Fetching repositories from ${org} organization...`)
    
    // Create Octokit instance
    const octokit = new Octokit({
      auth: token
    })
    
    // Get all repositories from the organization
    const { data: repos } = await octokit.rest.repos.listForOrg({
      org: org,
      type: 'all',
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    })
    
    log('green', `✅ Found ${repos.length} repositories`)
    return repos.map(repo => ({
      name: repo.name,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url,
      updated_at: repo.updated_at,
      private: repo.private
    }))
  } catch (error) {
    if (error.status === 404) {
      log('red', `❌ Organization '${org}' not found or not accessible`)
    } else if (error.status === 401) {
      log('red', `❌ Authentication failed. Please provide a valid GitHub token`)
    } else {
      log('red', `❌ Failed to fetch repositories: ${error.message}`)
    }
    process.exit(1)
  }
}

async function getUserRepos(username, token) {
  try {
    log('blue', `🔍 Fetching repositories from ${username} user account...`)
    
    // Create Octokit instance
    const octokit = new Octokit({
      auth: token
    })
    
    // Get all repositories for the user
    const { data: repos } = await octokit.rest.repos.listForUser({
      username: username,
      type: 'all',
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    })
    
    log('green', `✅ Found ${repos.length} repositories`)
    return repos.map(repo => ({
      name: repo.name,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url,
      updated_at: repo.updated_at,
      private: repo.private
    }))
  } catch (error) {
    if (error.status === 404) {
      log('red', `❌ User '${username}' not found or not accessible`)
    } else if (error.status === 401) {
      log('red', `❌ Authentication failed. Please provide a valid GitHub token`)
    } else {
      log('red', `❌ Failed to fetch repositories: ${error.message}`)
    }
    process.exit(1)
  }
}

async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function pullRepository(repoName, targetDir) {
  try {
    log('yellow', `📥 Pulling ${repoName}...`)
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = git(repoPath)
    
    const status = await simpleGit.status()
    if (status.files.length > 0) {
      log('cyan', `⚠️  ${repoName} has uncommitted changes, skipping pull`)
      return true
    }
    
    await simpleGit.pull()
    log('green', `✅ Successfully pulled ${repoName}`)
    return true
  } catch (error) {
    log('red', `❌ Failed to pull ${repoName}: ${error.message}`)
    return false
  }
}

async function cloneRepository(repo, targetDir, useSsh) {
  try {
    log('yellow', `📦 Cloning ${repo.name}...`)
    const simpleGit = git(targetDir)
    
    // Use SSH if requested and available, fallback to HTTPS
    const cloneUrl = useSsh && repo.ssh_url ? repo.ssh_url : repo.clone_url
    await simpleGit.clone(cloneUrl, repo.name)
    
    log('green', `✅ Successfully cloned ${repo.name}`)
    return true
  } catch (error) {
    log('red', `❌ Failed to clone ${repo.name}: ${error.message}`)
    return false
  }
}

async function main() {
  const { org, user, token, ssh: useSsh, dir: targetDir } = argv
  
  const target = org || user
  const targetType = org ? 'organization' : 'user'
  
  log('blue', `🚀 Starting ${target} ${targetType} repository sync...`)
  log('cyan', `📁 Target directory: ${targetDir}`)
  log('cyan', `🔗 Using ${useSsh ? 'SSH' : 'HTTPS'} for cloning`)
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir)
  
  const repos = org 
    ? await getOrganizationRepos(org, token)
    : await getUserRepos(user, token)
  
  let cloned = 0
  let pulled = 0
  let failed = 0
  let skipped = 0
  
  for (const repo of repos) {
    const repoPath = path.join(targetDir, repo.name)
    const exists = await directoryExists(repoPath)
    
    if (exists) {
      const success = await pullRepository(repo.name, targetDir)
      if (success) pulled++
      else failed++
    } else {
      if (repo.private && !token) {
        log('yellow', `⚠️  Skipping private repository ${repo.name} (no token provided)`)
        skipped++
        continue
      }
      
      const success = await cloneRepository(repo, targetDir, useSsh)
      if (success) cloned++
      else failed++
    }
  }
  
  log('blue', '\n📊 Summary:')
  log('green', `✅ Cloned: ${cloned}`)
  log('green', `✅ Pulled: ${pulled}`)
  if (skipped > 0) {
    log('yellow', `⚠️  Skipped: ${skipped}`)
  }
  if (failed > 0) {
    log('red', `❌ Failed: ${failed}`)
  }
  
  log('blue', '🎉 Repository sync completed!')
}

main().catch(error => {
  log('red', `💥 Script failed: ${error.message}`)
  process.exit(1)
})