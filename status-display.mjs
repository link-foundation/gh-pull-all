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

const DEFAULTS = {
  TERMINAL_WIDTH: 80,
  TERMINAL_HEIGHT: 24,
  HEADER_LINES: 3,
  MIN_MESSAGE_WIDTH: 20,
  SAFETY_MARGIN: 10,
  DURATION_PADDING: 6,
  PROGRESS_BAR_WIDTH: 50,
  PROGRESS_BAR_RESERVED_SPACE: 40,
  RENDER_INTERVAL_MS: 100,
  RESIZE_DEBOUNCE_MS: 150,
  GIT_TIMEOUT_MS: 30000
}

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
    this.terminalWidth = process.stdout.columns || DEFAULTS.TERMINAL_WIDTH
    this.terminalHeight = process.stdout.rows || DEFAULTS.TERMINAL_HEIGHT
    this.errors = []
    this.errorCounter = 0
    this.headerLines = DEFAULTS.HEADER_LINES
    this.completedRepos = [] // Store completed repos for persistent display
    this.currentBatchStart = 0
    this.lastRenderedCount = 0
    this.batchDisplayMode = true // New mode for batch-based display
    this.isDirty = false
    this.resizeTimeout = null

    // Listen for terminal resize
    if (this.isInteractive) {
      process.stdout.on('resize', () => {
        this.terminalWidth = process.stdout.columns || DEFAULTS.TERMINAL_WIDTH
        this.terminalHeight = process.stdout.rows || DEFAULTS.TERMINAL_HEIGHT
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout)
        }
        this.resizeTimeout = setTimeout(() => {
          if (this.useInPlaceUpdates) {
            this.isDirty = true
            this.render()
          }
        }, DEFAULTS.RESIZE_DEBOUNCE_MS)
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
    this.isDirty = true
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
      } else {
        this.isDirty = true
      }
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
    const baseLength = statusIcon.length + 1 + this.maxNameLength + 1 + DEFAULTS.DURATION_PADDING + 1
    const availableWidth = Math.max(
      DEFAULTS.MIN_MESSAGE_WIDTH,
      this.terminalWidth - baseLength - DEFAULTS.SAFETY_MARGIN
    )

    const displayMessage = this.formatStatusMessage(repo, repo.message, availableWidth)

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

    if (!this.isDirty && this.renderedOnce && !this.hasActiveRepos()) {
      return
    }
    this.isDirty = false

    if (!this.headerPrinted) {
      console.log(`\n${colors.bold}Repository Status${colors.reset}`)
      console.log(`${colors.dim}${'─'.repeat(Math.min(DEFAULTS.TERMINAL_WIDTH, this.terminalWidth))}${colors.reset}`)
      this.headerLines = DEFAULTS.HEADER_LINES
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
    const baseLength = 2 + this.maxNameLength + 1 + DEFAULTS.DURATION_PADDING + 1
    const availableWidth = Math.max(
      DEFAULTS.MIN_MESSAGE_WIDTH,
      this.terminalWidth - baseLength - DEFAULTS.SAFETY_MARGIN
    )

    // Print newly completed repos (these won't be updated again)
    for (const [name, repo] of newlyCompleted) {
      const statusIcon = this.getStatusIcon(repo.status)
      const statusColor = this.getStatusColor(repo.status)
      // Show static time for completed repos
      const duration = `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s`

      const baseLength = name.length + this.maxNameLength + 15
      const availableWidth = Math.max(
        DEFAULTS.MIN_MESSAGE_WIDTH,
        this.terminalWidth - baseLength - DEFAULTS.SAFETY_MARGIN
      )
      const fallbackMessage = repo.message || this.getStatusMessage(repo.status)
      const displayMessage = this.formatStatusMessage(repo, fallbackMessage, availableWidth)

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

      const displayMessage = this.formatStatusMessage(repo, repo.message, availableWidth)

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

  hasActiveRepos() {
    for (const repo of this.repos.values()) {
      if (repo.status === 'pending' ||
          repo.status === 'pulling' ||
          repo.status === 'cloning' ||
          repo.status === 'checking' ||
          repo.status === 'deleting') {
        return true
      }
    }
    return false
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

  formatStatusMessage(repo, message, availableWidth) {
    if (repo.status === 'failed' && repo.errorNumber) {
      return `Error #${repo.errorNumber}`
    }

    return this.truncateMessage(message, availableWidth)
  }

  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) {
      return message
    }
    return message.substring(0, maxLength - 3) + '...'
  }

  getVisibleLength(str) {
    // Remove ANSI escape codes to calculate visible length.
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').length
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
    const barWidth = Math.max(
      0,
      Math.min(DEFAULTS.PROGRESS_BAR_WIDTH, this.terminalWidth - DEFAULTS.PROGRESS_BAR_RESERVED_SPACE)
    )
    const completed = statusCounts.success + statusCounts.failed + statusCounts.skipped + statusCounts.uncommitted
    const inProgress = statusCounts.pulling + statusCounts.cloning + statusCounts.checking + statusCounts.deleting
    const pending = statusCounts.pending

    // Create bar segments - ensure they sum to barWidth
    let successWidth = Math.round((statusCounts.success / repoCount) * barWidth)
    const failedWidth = Math.round((statusCounts.failed / repoCount) * barWidth)
    const skippedWidth = Math.round(((statusCounts.skipped + statusCounts.uncommitted) / repoCount) * barWidth)
    const inProgressWidth = Math.round((inProgress / repoCount) * barWidth)
    let pendingWidth = barWidth - successWidth - failedWidth - skippedWidth - inProgressWidth

    // Adjust for rounding errors
    if (pendingWidth < 0) pendingWidth = 0
    const totalWidth = successWidth + failedWidth + skippedWidth + inProgressWidth + pendingWidth
    if (totalWidth < barWidth && completed === repoCount) {
      // If all done but bar not full due to rounding, extend success segment
      successWidth += barWidth - totalWidth
    }

    // Build the bar
    let bar = ''
    bar += colors.green + '█'.repeat(successWidth)
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
    console.log(`${colors.dim}${'─'.repeat(Math.min(DEFAULTS.TERMINAL_WIDTH, this.terminalWidth))}${colors.reset}`)

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
      switched_to_default: 0,
      already_on_default: 0,
      synced_with_upstream: 0,
      up_to_date_with_upstream: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      uncommitted: 0,
      merge_conflicts: 0,
      upstream_merge_conflicts: 0
    }

    for (const [name, repo] of this.repos) {
      switch (repo.status) {
        case 'success':
          if (repo.message.includes('cloned')) summary.cloned++
          else if (repo.message.includes('merged') && repo.message.includes('into')) summary.merged_from_default++
          else if (repo.message.includes('synced fork with upstream')) summary.synced_with_upstream++
          else if (repo.message.includes('up to date with upstream')) summary.up_to_date_with_upstream++
          else if (repo.message.includes('up to date with')) summary.up_to_date_with_default++
          else if (repo.message.includes('Switched from')) summary.switched_to_default++
          else if (repo.message.includes('Already on default branch')) summary.already_on_default++
          else if (repo.message.includes('pulled')) summary.pulled++
          else if (repo.message.includes('deleted')) summary.deleted++
          else if (repo.message.includes('uncommitted')) summary.uncommitted++
          break
        case 'failed':
          if (repo.message.includes('Merge conflict with upstream')) summary.upstream_merge_conflicts++
          else if (repo.message.includes('Merge conflict')) summary.merge_conflicts++
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
    if (summary.switched_to_default > 0) log('green', `🔄 Switched to default branch: ${summary.switched_to_default}`)
    if (summary.already_on_default > 0) log('green', `✅ Already on default branch: ${summary.already_on_default}`)
    if (summary.synced_with_upstream > 0) log('green', `🍴 Synced forks with upstream: ${summary.synced_with_upstream}`)
    if (summary.up_to_date_with_upstream > 0) log('green', `✅ Up to date with upstream: ${summary.up_to_date_with_upstream}`)
    if (summary.deleted > 0) log('green', `✅ Deleted: ${summary.deleted}`)
    if (summary.uncommitted > 0) log('yellow', `🔄 Uncommitted changes: ${summary.uncommitted}`)
    if (summary.skipped > 0) log('yellow', `⚠️  Skipped: ${summary.skipped}`)
    if (summary.upstream_merge_conflicts > 0) log('red', `💥 Upstream merge conflicts: ${summary.upstream_merge_conflicts}`)
    if (summary.merge_conflicts > 0) log('red', `💥 Merge conflicts: ${summary.merge_conflicts}`)
    if (summary.failed > 0) log('red', `❌ Failed: ${summary.failed}`)

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1)
    log('blue', `⏱️  Total time: ${totalTime}s`)
    log('blue', '🎉 Operation completed!')
  }
}

export { DEFAULTS, StatusDisplay, colors, log }
