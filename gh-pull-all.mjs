#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

// Import built-in Node.js modules
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
const { Octokit } = await use('@octokit/rest@22.0.0')
const { default: git } = await use('simple-git@3.28.0')
const fs = await use('fs-extra@11.3.0')
const { default: yargs } = await use('yargs@17.7.2')
const { hideBin } = await use('yargs@17.7.2/helpers')

// Get version from package.json or fallback
let version = '1.3.3' // Fallback version

try {
  const packagePath = path.join(__dirname, 'package.json')
  if (await fs.pathExists(packagePath)) {
    const packageJson = await fs.readJson(packagePath)
    version = packageJson.version
  }
} catch (error) {
  // Use fallback version if package.json can't be read
}

// Helper function for confirmation prompt
async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

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

// Status display system with safe terminal output
class StatusDisplay {
  constructor(liveUpdates = false, threads = 1) {
    this.repos = new Map()
    this.startTime = Date.now()
    this.isInteractive = process.stdout.isTTY && !process.env.CI
    this.threads = threads
    this.liveUpdates = liveUpdates
    this.useInPlaceUpdates = liveUpdates && this.isInteractive && threads > 1
    this.lastLoggedRepo = null
    this.headerPrinted = false
    this.renderedOnce = false
    this.maxNameLength = 0
    this.terminalWidth = process.stdout.columns || 80
    this.terminalHeight = process.stdout.rows || 24
    this.errors = []
    this.errorCounter = 0
    this.headerLines = 3 // Header + separator line + blank line
    this.completedRepos = [] // Store completed repos for persistent display
    this.currentBatchStart = 0
    this.lastRenderedCount = 0
    this.batchDisplayMode = true // New mode for batch-based display
    
    // Listen for terminal resize
    if (this.isInteractive) {
      process.stdout.on('resize', () => {
        this.terminalWidth = process.stdout.columns || 80
        this.terminalHeight = process.stdout.rows || 24
        // Keep render on resize for immediate response
        if (this.useInPlaceUpdates) {
          this.render()
        }
      })
    }
  }

  addRepo(name, status = 'pending') {
    this.repos.set(name, {
      name,
      status,
      startTime: Date.now(),
      message: '',
      logged: false,
      errorNumber: null
    })
    // Update max name length for proper alignment
    this.maxNameLength = Math.max(this.maxNameLength, name.length)
  }

  updateRepo(name, status, message = '') {
    const repo = this.repos.get(name)
    if (repo) {
      const oldStatus = repo.status
      repo.status = status
      repo.message = message
      if (status !== 'pending') {
        repo.endTime = Date.now()
      }
      
      // Handle error tracking
      if (status === 'failed' && !repo.errorNumber) {
        this.errorCounter++
        repo.errorNumber = this.errorCounter
        this.errors.push({
          number: this.errorCounter,
          repo: name,
          message: message
        })
      }
      
      if (!this.useInPlaceUpdates) {
        this.logStatusChange(repo, oldStatus)
      }
      // Render is now handled by the main loop at 10 FPS
    }
  }

  logStatusChange(repo, oldStatus) {
    // Only log meaningful status changes to avoid spam
    if (repo.status === 'pending' || repo.status === oldStatus) {
      return
    }

    // For single thread mode or no live updates with multiple threads,
    // only log final status (not intermediate states like 'pulling', 'cloning')
    if (this.threads === 1 || (!this.liveUpdates && this.threads > 1)) {
      if (repo.status === 'pulling' || repo.status === 'cloning') {
        return // Skip intermediate states
      }
    }

    const statusIcon = this.getStatusIcon(repo.status)
    const statusColor = this.getStatusColor(repo.status)
    // Only show static time for completed statuses in append-only mode
    const duration = (repo.status === 'success' || repo.status === 'failed' || repo.status === 'skipped' || repo.status === 'uncommitted') && repo.endTime
      ? `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s` 
      : `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
    
    // Calculate available space for message
    const baseLength = statusIcon.length + 1 + this.maxNameLength + 1 + 6 + 1 // icon + space + name + space + duration + space
    const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10) // Reserve 10 chars for safety
    
    let displayMessage = repo.message
    if (repo.status === 'failed' && repo.errorNumber) {
      displayMessage = `Error #${repo.errorNumber}: ${this.truncateMessage(repo.message, availableWidth - 10)}`
    } else {
      displayMessage = this.truncateMessage(repo.message, availableWidth)
    }
    
    // Build the line with proper padding to ensure full width clearing
    const line = `${statusColor}${statusIcon} ${repo.name.padEnd(this.maxNameLength)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${displayMessage}`
    
    // Calculate the visible length of the line (excluding ANSI codes)
    const visibleLength = this.getVisibleLength(line)
    
    // Pad the line to terminal width minus 1 to avoid wrapping
    const padding = Math.max(0, this.terminalWidth - visibleLength - 1)
    const paddedLine = line + ' '.repeat(padding)
    
    console.log(paddedLine)
    repo.logged = true
  }

  render() {
    if (!this.useInPlaceUpdates) {
      return // Use append-only mode by default
    }

    if (!this.headerPrinted) {
      console.log(`\n${colors.bold}Repository Status${colors.reset}`)
      console.log(`${colors.dim}${'─'.repeat(Math.min(80, this.terminalWidth))}${colors.reset}`)
      this.headerLines = 3 // Don't include legend in header lines
      this.headerPrinted = true
    }

    // In batch mode, we show completed repos + current batch
    const sortedRepos = Array.from(this.repos.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const activeRepos = []
    const newlyCompleted = []
    
    // Separate active and completed repos
    for (const [name, repo] of sortedRepos) {
      if (repo.status === 'pending' || repo.status === 'pulling' || repo.status === 'cloning' || repo.status === 'checking' || repo.status === 'deleting') {
        activeRepos.push([name, repo])
      } else if (!this.completedRepos.find(r => r[0] === name)) {
        newlyCompleted.push([name, repo])
      }
    }
    
    // Add newly completed repos to the persistent list
    this.completedRepos.push(...newlyCompleted)
    
    // Calculate display space
    const availableLines = Math.max(1, this.terminalHeight - this.headerLines - 5) // Reserve space for progress bar + legend
    const batchSize = Math.min(this.threads, availableLines)
    
    // Determine current batch of active repos
    const currentBatch = activeRepos.slice(0, batchSize)
    
    // Move cursor up only for the current batch
    if (this.renderedOnce && this.lastRenderedCount > 0) {
      process.stdout.write(`\x1b[${this.lastRenderedCount}A`)
    }

    // Calculate available space for message
    const baseLength = 2 + this.maxNameLength + 1 + 6 + 1 // icon + space + name + space + duration + space
    const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10) // Reserve 10 chars for safety

    // Print newly completed repos (these won't be updated again)
    for (const [name, repo] of newlyCompleted) {
      const statusIcon = this.getStatusIcon(repo.status)
      const statusColor = this.getStatusColor(repo.status)
      // Show static time for completed repos
      const duration = `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s`
      
      let displayMessage = repo.message || this.getStatusMessage(repo.status)
      const baseLength = name.length + this.maxNameLength + 15
      const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10)
      
      if (displayMessage && displayMessage.length > availableWidth) {
        displayMessage = this.truncateMessage(displayMessage, availableWidth)
      }
      
      const line = `${statusColor}${statusIcon} ${name.padEnd(this.maxNameLength)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${displayMessage}`
      
      // Calculate the visible length of the line (excluding ANSI codes)
      const visibleLength = this.getVisibleLength(line)
      
      // Pad the line to terminal width minus 1 to avoid wrapping
      const padding = Math.max(0, this.terminalWidth - visibleLength - 1)
      const paddedLine = line + ' '.repeat(padding)
      
      console.log(paddedLine)
    }
    
    // Render current batch of active repos with live updates
    let renderedCount = 0
    for (const [name, repo] of currentBatch) {
      
      const statusIcon = this.getStatusIcon(repo.status)
      const statusColor = this.getStatusColor(repo.status)
      // Always show ticking time for active repos (no endTime)
      const duration = `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
      
      let displayMessage = repo.message
      if (repo.status === 'failed' && repo.errorNumber) {
        displayMessage = `Error #${repo.errorNumber}: ${this.truncateMessage(repo.message, availableWidth - 10)}`
      } else {
        displayMessage = this.truncateMessage(repo.message, availableWidth)
      }
      
      const line = `${statusColor}${statusIcon} ${repo.name.padEnd(this.maxNameLength)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${displayMessage}`
      
      // Calculate the visible length of the line (excluding ANSI codes)
      const visibleLength = this.getVisibleLength(line)
      
      // Pad the line to terminal width minus 1 to avoid wrapping
      const padding = Math.max(0, this.terminalWidth - visibleLength - 1)
      const paddedLine = line + ' '.repeat(padding)
      
      // Clear the line and write new content
      process.stdout.write('\x1b[2K') // Clear entire line
      console.log(paddedLine)
      renderedCount++
    }
    
    // Show progress bar and legend together
    if (this.isInteractive) {
      // Empty line before progress section
      process.stdout.write('\x1b[2K')
      console.log()
      renderedCount++
      
      // Legend line (right above progress bar)
      process.stdout.write('\x1b[2K')
      console.log(`${colors.dim}Progress: ${colors.green}█${colors.dim}=success ${colors.red}█${colors.dim}=failed ${colors.yellow}█${colors.dim}=skipped ${colors.cyan}█${colors.dim}=in progress ${colors.dim}░=pending${colors.reset}`)
      renderedCount++
      
      // Progress bar
      const progressBar = this.createProgressBar()
      if (progressBar) {
        process.stdout.write('\x1b[2K')
        console.log(progressBar)
        renderedCount++
      }
      
      // No empty line after progress bar - it creates double spacing during process
    }
    
    this.renderedOnce = true
    this.lastRenderedCount = renderedCount
  }

  getStatusIcon(status) {
    switch (status) {
      case 'pending': return '⏳'
      case 'cloning': return '📦'
      case 'pulling': return '📥'
      case 'checking': return '🔍'
      case 'deleting': return '🗑️ '
      case 'success': return '✅'
      case 'failed': return '❌'
      case 'skipped': return '⚠️ '
      case 'uncommitted': return '🔄'
      default: return '❓'
    }
  }

  getStatusMessage(status) {
    switch (status) {
      case 'success': return 'Successfully pulled'
      case 'failed': return 'Failed to pull'
      case 'skipped': return 'Skipped - not a git repository'
      case 'uncommitted': return 'Has uncommitted changes'
      case 'cloning': return 'Cloning repository...'
      case 'pulling': return 'Pulling updates...'
      case 'checking': return 'Checking for uncommitted changes...'
      case 'deleting': return 'Deleting repository...'
      default: return ''
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'pending': return colors.dim
      case 'cloning':
      case 'pulling': 
      case 'checking':
      case 'deleting': return colors.cyan  // Changed to cyan to match progress bar "active"
      case 'success': return colors.green
      case 'failed': return colors.red
      case 'skipped': return colors.yellow
      case 'uncommitted': return colors.yellow  // Changed to yellow to group with skipped
      default: return colors.reset
    }
  }

  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) {
      return message
    }
    return message.substring(0, maxLength - 3) + '...'
  }

  getVisibleLength(str) {
    // Remove ANSI escape codes to calculate visible length
    return str.replace(/\x1b\[[0-9;]*m/g, '').length
  }

  createProgressBar() {
    const repoCount = this.repos.size
    if (repoCount === 0) return ''
    
    // Count statuses
    const statusCounts = {
      success: 0,
      failed: 0,
      pending: 0,
      pulling: 0,
      cloning: 0,
      checking: 0,
      deleting: 0,
      skipped: 0,
      uncommitted: 0
    }
    
    for (const [_, repo] of this.repos) {
      if (statusCounts.hasOwnProperty(repo.status)) {
        statusCounts[repo.status]++
      }
    }
    
    // Calculate bar width (reserve space for text)
    const barWidth = Math.min(50, this.terminalWidth - 40)
    const completed = statusCounts.success + statusCounts.failed + statusCounts.skipped + statusCounts.uncommitted
    const inProgress = statusCounts.pulling + statusCounts.cloning + statusCounts.checking + statusCounts.deleting
    const pending = statusCounts.pending
    
    // Create bar segments - ensure they sum to barWidth
    const successWidth = Math.round((statusCounts.success / repoCount) * barWidth)
    const failedWidth = Math.round((statusCounts.failed / repoCount) * barWidth)
    const skippedWidth = Math.round(((statusCounts.skipped + statusCounts.uncommitted) / repoCount) * barWidth)
    const inProgressWidth = Math.round((inProgress / repoCount) * barWidth)
    let pendingWidth = barWidth - successWidth - failedWidth - skippedWidth - inProgressWidth
    
    // Adjust for rounding errors
    if (pendingWidth < 0) pendingWidth = 0
    const totalWidth = successWidth + failedWidth + skippedWidth + inProgressWidth + pendingWidth
    if (totalWidth < barWidth && completed === repoCount) {
      // If all done but bar not full due to rounding, extend success segment
      const diff = barWidth - totalWidth
      return this.createProgressBar.call(this, { 
        ...arguments[0], 
        _successWidth: successWidth + diff 
      })
    }
    
    // Build the bar
    let bar = ''
    const finalSuccessWidth = arguments[0]?._successWidth || successWidth
    bar += colors.green + '█'.repeat(finalSuccessWidth)
    bar += colors.red + '█'.repeat(failedWidth)
    bar += colors.yellow + '█'.repeat(skippedWidth)
    bar += colors.cyan + '█'.repeat(inProgressWidth)
    bar += colors.dim + '░'.repeat(Math.max(0, pendingWidth))
    bar += colors.reset
    
    // Create status text
    const percentage = Math.round((completed / repoCount) * 100)
    const statusText = `${completed}/${repoCount} (${percentage}%)`
    
    // Add error count if any
    const errorText = statusCounts.failed > 0 ? ` ${colors.red}${statusCounts.failed} errors${colors.reset}` : ''
    
    return `[${bar}] ${statusText}${errorText}`
  }

  printErrors() {
    if (this.errors.length === 0) {
      return
    }

    console.log() // Add spacing
    log('red', `${colors.bold}❌ Errors:${colors.reset}`)
    console.log(`${colors.dim}${'─'.repeat(Math.min(80, this.terminalWidth))}${colors.reset}`)
    
    for (const error of this.errors) {
      console.log(`${colors.red}#${error.number.toString().padStart(2)} ${colors.yellow}${error.repo}${colors.reset}: ${error.message}`)
    }
  }

  printSummary() {
    const summary = {
      cloned: 0,
      pulled: 0,
      merged_from_default: 0,
      up_to_date_with_default: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      uncommitted: 0,
      merge_conflicts: 0
    }

    for (const [name, repo] of this.repos) {
      switch (repo.status) {
        case 'success':
          if (repo.message.includes('cloned')) summary.cloned++
          else if (repo.message.includes('merged') && repo.message.includes('into')) summary.merged_from_default++
          else if (repo.message.includes('up to date with')) summary.up_to_date_with_default++
          else if (repo.message.includes('pulled')) summary.pulled++
          else if (repo.message.includes('deleted')) summary.deleted++
          else if (repo.message.includes('uncommitted')) summary.uncommitted++
          break
        case 'failed':
          if (repo.message.includes('Merge conflict')) summary.merge_conflicts++
          else summary.failed++
          break
        case 'skipped':
          summary.skipped++
          break
        case 'uncommitted':
          summary.uncommitted++
          break
      }
    }

    // Print errors list (append-only, after all repos are done)
    this.printErrors()

    console.log() // Add spacing before summary
    log('blue', `${colors.bold}📊 Summary:${colors.reset}`)
    if (summary.cloned > 0) log('green', `✅ Cloned: ${summary.cloned}`)
    if (summary.pulled > 0) log('green', `✅ Pulled: ${summary.pulled}`)
    if (summary.merged_from_default > 0) log('green', `🔀 Merged from default branch: ${summary.merged_from_default}`)
    if (summary.up_to_date_with_default > 0) log('green', `✅ Up to date with default: ${summary.up_to_date_with_default}`)
    if (summary.deleted > 0) log('green', `✅ Deleted: ${summary.deleted}`)
    if (summary.uncommitted > 0) log('yellow', `🔄 Uncommitted changes: ${summary.uncommitted}`)
    if (summary.skipped > 0) log('yellow', `⚠️  Skipped: ${summary.skipped}`)
    if (summary.merge_conflicts > 0) log('red', `💥 Merge conflicts: ${summary.merge_conflicts}`)
    if (summary.failed > 0) log('red', `❌ Failed: ${summary.failed}`)

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1)
    log('blue', `⏱️  Total time: ${totalTime}s`)
    log('blue', '🎉 Operation completed!')
  }
}

// Helper function to check if gh CLI is installed
async function isGhInstalled() {
  try {
    const { execSync } = await import('child_process')
    execSync('gh --version', { stdio: 'pipe' })
    return true
  } catch (error) {
    return false
  }
}

// Helper function to get GitHub token from gh CLI if available
async function getGhToken() {
  try {
    if (!(await isGhInstalled())) {
      return null
    }
    
    const { execSync } = await import('child_process')
    const token = execSync('gh auth token', { encoding: 'utf8', stdio: 'pipe' }).trim()
    return token
  } catch (error) {
    return null
  }
}

// Helper function to get repositories using gh CLI
async function getReposFromGhCli(org, user) {
  try {
    if (!(await isGhInstalled())) {
      return null
    }
    
    const { execSync } = await import('child_process')
    const target = org || user
    
    const command = `gh repo list ${target} --json name,isPrivate,url,sshUrl,updatedAt --limit 1000`
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
    const repos = JSON.parse(output)
    
    return repos.map(repo => ({
      name: repo.name,
      clone_url: repo.url + '.git',
      ssh_url: repo.sshUrl,
      html_url: repo.url,
      updated_at: repo.updatedAt,
      private: repo.isPrivate
    }))
  } catch (error) {
    return null
  }
}

// Configure CLI arguments
const scriptName = path.basename(process.argv[1])
const argv = yargs(hideBin(process.argv))
  .scriptName(scriptName)
  .version(version)
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
  .check((argv) => {
    if (!argv.org && !argv.user) {
      throw new Error('You must specify either --org or --user')
    }
    if (argv.org && argv.user) {
      throw new Error('You cannot specify both --org and --user')
    }
    if (argv.threads < 1) {
      throw new Error('Thread count must be at least 1')
    }
    if (argv['single-thread'] && argv.threads !== 8) {
      throw new Error('Cannot specify both --single-thread and --threads')
    }
    return true
  })
  .help('h')
  .alias('h', 'help')
  .example('$0 --org deep-assistant', 'Sync all repositories from deep-assistant organization')
  .example('$0 --user konard', 'Sync all repositories from konard user account')
  .example('$0 --org myorg --ssh --dir ./repos', 'Clone using SSH to ./repos directory')
  .example('$0 --user konard --threads 5', 'Use 5 concurrent operations')
  .example('$0 --user konard --single-thread', 'Run operations sequentially')
  .example('$0 --user konard -j 16', 'Use 16 concurrent operations (alias for --threads)')
  .example('$0 --user konard --no-live-updates', 'Disable live updates for terminal history preservation')
  .example('$0 --user konard --delete', 'Delete all cloned repositories (with confirmation)')
  .example('$0 --user konard --pull-from-default', 'Pull from default branch to current branch when behind')
  .argv

async function getOrganizationRepos(org, token) {
  try {
    log('blue', `🔍 Fetching repositories from ${org} organization...`)
    
    // Create Octokit instance
    const octokit = new Octokit({
      auth: token,
      baseUrl: 'https://api.github.com'
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
    const apiUrl = `https://api.github.com/orgs/${org}/repos`
    if (error.status === 404) {
      log('red', `❌ Organization '${org}' not found or not accessible`)
      log('yellow', `   API URL: ${apiUrl}`)
    } else if (error.status === 401) {
      log('red', `❌ Authentication failed. Please provide a valid GitHub token`)
      log('yellow', `   API URL: ${apiUrl}`)
    } else {
      log('red', `❌ Failed to fetch repositories from: ${apiUrl}`)
      log('red', `   Error: ${error.message}`)
      if (error.message.includes('Unable to connect')) {
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
}

async function getUserRepos(username, token) {
  try {
    log('blue', `🔍 Fetching repositories from ${username} user account...`)
    
    // Create Octokit instance
    const octokit = new Octokit({
      auth: token,
      baseUrl: 'https://api.github.com'
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
    const apiUrl = `https://api.github.com/users/${username}/repos`
    if (error.status === 404) {
      log('red', `❌ User '${username}' not found or not accessible`)
      log('yellow', `   API URL: ${apiUrl}`)
    } else if (error.status === 401) {
      log('red', `❌ Authentication failed. Please provide a valid GitHub token`)
      log('yellow', `   API URL: ${apiUrl}`)
    } else {
      log('red', `❌ Failed to fetch repositories from: ${apiUrl}`)
      log('red', `   Error: ${error.message}`)
      if (error.message.includes('Unable to connect')) {
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
}

async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath)
    return stats.isDirectory()
  } catch {
    return false
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

async function pullRepository(repoName, targetDir, statusDisplay, pullFromDefault = false) {
  try {
    statusDisplay.updateRepo(repoName, 'pulling', 'Checking status...')
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = git(repoPath)
    
    const status = await simpleGit.status()
    if (status.files.length > 0) {
      statusDisplay.updateRepo(repoName, 'uncommitted', 'Has uncommitted changes, skipped')
      return { success: true, type: 'uncommitted' }
    }
    
    statusDisplay.updateRepo(repoName, 'pulling', 'Fetching all branches...')
    await simpleGit.fetch(['--all'])
    
    if (pullFromDefault) {
      // Get current branch
      const currentBranch = await simpleGit.revparse(['--abbrev-ref', 'HEAD'])
      const currentBranchName = currentBranch.trim()
      
      // Get default branch
      statusDisplay.updateRepo(repoName, 'pulling', 'Detecting default branch...')
      const defaultBranch = await getDefaultBranch(simpleGit)
      
      if (currentBranchName !== defaultBranch) {
        // Attempt to merge from default branch
        statusDisplay.updateRepo(repoName, 'pulling', `Merging changes from ${defaultBranch}...`)
        try {
          const remoteName = 'origin' // Assume origin for now
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
    const simpleGit = git(targetDir)
    
    // Use SSH if requested and available, fallback to HTTPS
    const cloneUrl = useSsh && repo.ssh_url ? repo.ssh_url : repo.clone_url
    await simpleGit.clone(cloneUrl, repo.name)
    
    statusDisplay.updateRepo(repo.name, 'cloning', 'Fetching all branches...')
    const repoPath = path.join(targetDir, repo.name)
    const repoGit = git(repoPath)
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
    const simpleGit = git(repoPath)
    
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
async function processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault = false) {
  const repoPath = path.join(targetDir, repo.name)
  const exists = await directoryExists(repoPath)
  
  // Check if private repo without token
  if (repo.private && !token && !exists) {
    statusDisplay.updateRepo(repo.name, 'skipped', 'Private repo, no token provided')
    return { success: true, type: 'skipped' }
  }
  
  if (exists) {
    return await pullRepository(repo.name, targetDir, statusDisplay, pullFromDefault)
  } else {
    return await cloneRepository(repo, targetDir, useSsh, statusDisplay)
  }
}

async function main() {
  let { org, user, token, ssh: useSsh, dir: targetDir, threads, 'single-thread': singleThread, 'live-updates': liveUpdates, delete: deleteMode, 'pull-from-default': pullFromDefault } = argv
  
  // If no token provided, try to get it from gh CLI
  if (!token || token === undefined) {
    const ghToken = await getGhToken()
    if (ghToken) {
      token = ghToken
      log('cyan', '🔑 Using GitHub token from gh CLI')
    }
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
    log('cyan', `⚡ Concurrency: ${concurrencyLimit} ${concurrencyLimit === 1 ? 'thread (sequential)' : 'threads (parallel)'}`)
  }
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir)
  
  // Try to get repositories using gh CLI first (includes private repos)
  let repos = await getReposFromGhCli(org, user)
  
  if (repos) {
    log('cyan', '📋 Using gh CLI to fetch repositories (includes private repos)')
  } else {
    // Fallback to API calls
    log('cyan', '📋 Using GitHub API to fetch repositories')
    repos = org 
      ? await getOrganizationRepos(org, token)
      : await getUserRepos(user, token)
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
          : await processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault)
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
              : processRepository(repo, targetDir, useSsh, statusDisplay, token, pullFromDefault)
            
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

main().catch(error => {
  log('red', `💥 Script failed: ${error.message}`)
  process.exit(1)
})