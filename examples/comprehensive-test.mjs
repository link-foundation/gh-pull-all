#!/usr/bin/env node

// More comprehensive test to reproduce the exact issue
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
    this.headerLines = 3
    this.completedRepos = []
    this.currentBatchStart = 0
    this.lastRenderedCount = 0
    this.batchDisplayMode = true
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
      
      // Handle error tracking - THIS IS THE KEY PART
      if (status === 'failed' && !repo.errorNumber) {
        this.errorCounter++
        repo.errorNumber = this.errorCounter
        this.errors.push({
          number: this.errorCounter,
          repo: name,
          message: message
        })
        console.log(`DEBUG: Assigned error #${repo.errorNumber} to ${name}`)
      }
      
      if (!this.useInPlaceUpdates) {
        this.logStatusChange(repo, oldStatus)
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

    const statusIcon = repo.status === 'failed' ? '❌' : '✅'
    // Only show static time for completed statuses in append-only mode
    const duration = (repo.status === 'success' || repo.status === 'failed' || repo.status === 'skipped' || repo.status === 'uncommitted') && repo.endTime
      ? `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s` 
      : `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
    
    // Calculate available space for message
    const baseLength = statusIcon.length + 1 + this.maxNameLength + 1 + 6 + 1 // icon + space + name + space + duration + space
    const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10) // Reserve 10 chars for safety
    
    let displayMessage = repo.message
    console.log(`DEBUG: repo.status=${repo.status}, repo.errorNumber=${repo.errorNumber}`)
    if (repo.status === 'failed' && repo.errorNumber) {
      displayMessage = `Error #${repo.errorNumber}`
      console.log(`DEBUG: Using short error format: ${displayMessage}`)
    } else {
      displayMessage = this.truncateMessage(repo.message, availableWidth)
      console.log(`DEBUG: Using truncated message: ${displayMessage}`)
    }
    
    // Build the line with proper padding to ensure full width clearing
    const line = `${statusIcon} ${repo.name.padEnd(this.maxNameLength)} ${duration.padStart(6)} ${displayMessage}`
    
    console.log(line)
    repo.logged = true
  }

  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) {
      return message
    }
    return message.substring(0, maxLength - 3) + '...'
  }
}

// Test different scenarios
console.log('=== Test 1: Single thread, no live updates ===')
const display1 = new StatusDisplay(false, 1)
display1.addRepo('boolean')
display1.updateRepo('boolean', 'failed', 'Error: Your configuration specifies to merge with the ref \'refs/heads/main\' from the remote, but no such ref was fetched.')

console.log('\n=== Test 2: Multi-thread, no live updates ===')
const display2 = new StatusDisplay(false, 8)
display2.addRepo('boolean')
display2.updateRepo('boolean', 'failed', 'Error: Your configuration specifies to merge with the ref \'refs/heads/main\' from the remote, but no such ref was fetched.')

console.log('\n=== Test 3: Multi-thread, with live updates ===')
const display3 = new StatusDisplay(true, 8)
display3.addRepo('boolean')
display3.updateRepo('boolean', 'failed', 'Error: Your configuration specifies to merge with the ref \'refs/heads/main\' from the remote, but no such ref was fetched.')