#!/usr/bin/env bun

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

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
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

// Status display system for in-place updates
class StatusDisplay {
  constructor() {
    this.repos = new Map()
    this.startTime = Date.now()
    this.isInteractive = process.stdout.isTTY
    this.headerPrinted = false
  }

  addRepo(name, status = 'pending') {
    this.repos.set(name, {
      name,
      status,
      startTime: Date.now(),
      message: ''
    })
  }

  updateRepo(name, status, message = '') {
    const repo = this.repos.get(name)
    if (repo) {
      repo.status = status
      repo.message = message
      if (status !== 'pending') {
        repo.endTime = Date.now()
      }
      this.render()
    }
  }

  render() {
    if (!this.isInteractive) {
      return // Don't render table in non-interactive mode
    }

    if (!this.headerPrinted) {
      console.log(`\n${colors.bold}Repository Status${colors.reset}`)
      console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}`)
      this.headerPrinted = true
    }

    // Move cursor up by the number of repos to overwrite previous output
    if (this.repos.size > 0) {
      process.stdout.write(`\x1b[${this.repos.size}A`)
    }

    // Render each repository status
    for (const [name, repo] of this.repos) {
      const statusIcon = this.getStatusIcon(repo.status)
      const statusColor = this.getStatusColor(repo.status)
      const duration = repo.endTime ? 
        `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s` : 
        `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
      
      const line = `${statusColor}${statusIcon}${colors.reset} ${name.padEnd(30)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${repo.message}`
      
      // Clear the line and write new content
      process.stdout.write('\x1b[2K') // Clear entire line
      console.log(line)
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case 'pending': return '⏳'
      case 'cloning': return '📦'
      case 'pulling': return '📥'
      case 'success': return '✅'
      case 'failed': return '❌'
      case 'skipped': return '⚠️ '
      case 'uncommitted': return '🔄'
      default: return '❓'
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'pending': return colors.dim
      case 'cloning':
      case 'pulling': return colors.yellow
      case 'success': return colors.green
      case 'failed': return colors.red
      case 'skipped': return colors.yellow
      case 'uncommitted': return colors.cyan
      default: return colors.reset
    }
  }

  printSummary() {
    const summary = {
      cloned: 0,
      pulled: 0,
      failed: 0,
      skipped: 0,
      uncommitted: 0
    }

    for (const [name, repo] of this.repos) {
      switch (repo.status) {
        case 'success':
          if (repo.message.includes('cloned')) summary.cloned++
          else if (repo.message.includes('pulled')) summary.pulled++
          else if (repo.message.includes('uncommitted')) summary.uncommitted++
          break
        case 'failed':
          summary.failed++
          break
        case 'skipped':
          summary.skipped++
          break
      }
    }

    console.log(`\n${colors.bold}📊 Summary:${colors.reset}`)
    if (summary.cloned > 0) log('green', `✅ Cloned: ${summary.cloned}`)
    if (summary.pulled > 0) log('green', `✅ Pulled: ${summary.pulled}`)
    if (summary.uncommitted > 0) log('cyan', `🔄 Uncommitted changes: ${summary.uncommitted}`)
    if (summary.skipped > 0) log('yellow', `⚠️  Skipped: ${summary.skipped}`)
    if (summary.failed > 0) log('red', `❌ Failed: ${summary.failed}`)

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1)
    log('blue', `⏱️  Total time: ${totalTime}s`)
    log('blue', '🎉 Repository sync completed!')
  }
}

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

async function pullRepository(repoName, targetDir, statusDisplay) {
  try {
    statusDisplay.updateRepo(repoName, 'pulling', 'Checking status...')
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = git(repoPath)
    
    const status = await simpleGit.status()
    if (status.files.length > 0) {
      statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
      return { success: true, type: 'uncommitted' }
    }
    
    statusDisplay.updateRepo(repoName, 'pulling', 'Pulling changes...')
    await simpleGit.pull()
    statusDisplay.updateRepo(repoName, 'success', 'Successfully pulled')
    return { success: true, type: 'pulled' }
  } catch (error) {
    statusDisplay.updateRepo(repoName, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'pull', error: error.message }
  }
}

async function cloneRepository(repo, targetDir, useSsh, statusDisplay) {
  try {
    statusDisplay.updateRepo(repo.name, 'cloning', 'Starting clone...')
    const simpleGit = git(targetDir)
    
    // Use SSH if requested and available, fallback to HTTPS
    const cloneUrl = useSsh && repo.ssh_url ? repo.ssh_url : repo.clone_url
    await simpleGit.clone(cloneUrl, repo.name)
    
    statusDisplay.updateRepo(repo.name, 'success', 'Successfully cloned')
    return { success: true, type: 'cloned' }
  } catch (error) {
    statusDisplay.updateRepo(repo.name, 'failed', `Error: ${error.message}`)
    return { success: false, type: 'clone', error: error.message }
  }
}

// Process repository (either pull or clone)
async function processRepository(repo, targetDir, useSsh, statusDisplay, token) {
  const repoPath = path.join(targetDir, repo.name)
  const exists = await directoryExists(repoPath)
  
  // Check if private repo without token
  if (repo.private && !token && !exists) {
    statusDisplay.updateRepo(repo.name, 'skipped', 'Private repo, no token provided')
    return { success: true, type: 'skipped' }
  }
  
  if (exists) {
    return await pullRepository(repo.name, targetDir, statusDisplay)
  } else {
    return await cloneRepository(repo, targetDir, useSsh, statusDisplay)
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
  
  // Initialize status display
  const statusDisplay = new StatusDisplay()
  
  // Add all repositories to status display
  for (const repo of repos) {
    statusDisplay.addRepo(repo.name)
  }
  
  // Initial render
  statusDisplay.render()
  
  // Process all repositories in parallel
  const concurrencyLimit = 10 // Limit concurrent operations to avoid overwhelming the system
  const results = []
  
  // Process repos in batches to control concurrency
  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit)
    const batchPromises = batch.map(repo => 
      processRepository(repo, targetDir, useSsh, statusDisplay, token)
    )
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
  }
  
  // Print final summary
  statusDisplay.printSummary()
}

main().catch(error => {
  log('red', `💥 Script failed: ${error.message}`)
  process.exit(1)
})