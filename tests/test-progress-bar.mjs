#!/usr/bin/env bun

// Test progress bar functionality
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')

// Mock StatusDisplay with progress bar functionality
class StatusDisplay {
  constructor() {
    this.repos = new Map()
    this.terminalWidth = 80
  }

  addRepo(name, status = 'pending') {
    this.repos.set(name, { name, status })
  }

  updateRepo(name, status) {
    const repo = this.repos.get(name)
    if (repo) {
      repo.status = status
    }
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
    const inProgress = statusCounts.pulling + statusCounts.cloning
    const pending = statusCounts.pending
    
    // Create bar segments - ensure they sum to barWidth
    const successWidth = Math.round((statusCounts.success / repoCount) * barWidth)
    const failedWidth = Math.round((statusCounts.failed / repoCount) * barWidth)
    const skippedWidth = Math.round(((statusCounts.skipped + statusCounts.uncommitted) / repoCount) * barWidth)
    const inProgressWidth = Math.round((inProgress / repoCount) * barWidth)
    let pendingWidth = barWidth - successWidth - failedWidth - skippedWidth - inProgressWidth
    
    // Adjust for rounding errors
    if (pendingWidth < 0) pendingWidth = 0
    
    // Build the bar (without colors for testing)
    let bar = ''
    bar += '█'.repeat(successWidth)
    bar += '█'.repeat(failedWidth)
    bar += '█'.repeat(skippedWidth)
    bar += '█'.repeat(inProgressWidth)
    bar += '░'.repeat(Math.max(0, pendingWidth))
    
    // Create status text
    const percentage = Math.round((completed / repoCount) * 100)
    const statusText = `${completed}/${repoCount} (${percentage}%)`
    
    // Add error count if any
    const errorText = statusCounts.failed > 0 ? ` ${statusCounts.failed} errors` : ''
    
    return `[${bar}] ${statusText}${errorText}`
  }
}

test('progress bar with all pending', () => {
  const display = new StatusDisplay()
  display.addRepo('repo1', 'pending')
  display.addRepo('repo2', 'pending')
  display.addRepo('repo3', 'pending')
  
  const progressBar = display.createProgressBar()
  assert.match(progressBar, /\[░+\]/)
  assert.match(progressBar, /0\/3 \(0%\)/)
})

test('progress bar with mixed statuses', () => {
  const display = new StatusDisplay()
  display.addRepo('repo1', 'success')
  display.addRepo('repo2', 'failed')
  display.addRepo('repo3', 'pending')
  display.addRepo('repo4', 'pulling')
  display.addRepo('repo5', 'success')
  
  const progressBar = display.createProgressBar()
  assert.match(progressBar, /3\/5 \(60%\)/)
  assert.match(progressBar, /1 errors/)
})

test('progress bar with all completed', () => {
  const display = new StatusDisplay()
  display.addRepo('repo1', 'success')
  display.addRepo('repo2', 'success')
  display.addRepo('repo3', 'success')
  
  const progressBar = display.createProgressBar()
  assert.match(progressBar, /\[█+\]/)
  assert.match(progressBar, /3\/3 \(100%\)/)
})

test('progress bar handles empty repos', () => {
  const display = new StatusDisplay()
  const progressBar = display.createProgressBar()
  assert.equal(progressBar, '')
})

test('progress bar respects terminal width', () => {
  const display = new StatusDisplay()
  display.terminalWidth = 60 // Smaller terminal
  
  for (let i = 0; i < 10; i++) {
    display.addRepo(`repo${i}`, 'success')
  }
  
  const progressBar = display.createProgressBar()
  // Bar width should be max 20 chars (60 - 40)
  const barMatch = progressBar.match(/\[([█░]+)\]/)
  assert.ok(barMatch)
  assert.ok(barMatch[1].length <= 20)
})

test('progress bar groups uncommitted with skipped', () => {
  const display = new StatusDisplay()
  display.addRepo('repo1', 'uncommitted')
  display.addRepo('repo2', 'skipped')
  display.addRepo('repo3', 'pending')
  
  const progressBar = display.createProgressBar()
  assert.match(progressBar, /2\/3 \(67%\)/)
})

test.run()