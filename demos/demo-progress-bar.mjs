#!/usr/bin/env node

import { StatusDisplay } from './gh-pull-all.mjs'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

console.log(`${colors.bold}Demo: Progress Bar with Windowed Display${colors.reset}\n`)

// Create mock repositories
const repos = new Map()
const statuses = ['success', 'failed', 'skipped', 'pulling', 'pending', 'uncommitted']
const statusDistribution = [40, 5, 8, 12, 30, 5] // Percentage for each status

let total = 0
for (let i = 1; i <= 100; i++) {
  const statusIndex = Math.floor(Math.random() * statuses.length)
  const status = statuses[statusIndex]
  
  repos.set(`repo-${String(i).padStart(3, '0')}`, {
    name: `repo-${String(i).padStart(3, '0')}`,
    status: status,
    message: status === 'failed' ? 'Connection timeout' : '',
    startTime: Date.now() - Math.random() * 5000,
    endTime: status === 'pending' || status === 'pulling' ? null : Date.now()
  })
}

// Create display with 15 threads (to show windowing)
const display = new StatusDisplay()
display.setThreads(15)
display.setLiveUpdates(true)

// Initialize repos
for (const [name, repo] of repos) {
  display.repos.set(name, repo)
  display.maxNameLength = Math.max(display.maxNameLength, name.length)
}

// Simulate progress
console.log('Simulating repository processing with progress bar...\n')

let iteration = 0
const interval = setInterval(() => {
  // Randomly update some pending repos to other statuses
  for (const [name, repo] of display.repos) {
    if (repo.status === 'pending' && Math.random() > 0.9) {
      repo.status = Math.random() > 0.8 ? 'failed' : 'success'
      repo.endTime = Date.now()
      repo.message = repo.status === 'failed' ? 'Connection error' : ''
    } else if (repo.status === 'pulling' && Math.random() > 0.7) {
      repo.status = 'success'
      repo.endTime = Date.now()
    }
  }
  
  display.render()
  
  iteration++
  
  // Check if all repos are done
  let allDone = true
  for (const [_, repo] of display.repos) {
    if (repo.status === 'pending' || repo.status === 'pulling') {
      allDone = false
      break
    }
  }
  
  if (allDone || iteration > 50) {
    clearInterval(interval)
    console.log(`\n${colors.bold}Demo complete!${colors.reset}`)
    process.exit(0)
  }
}, 500)