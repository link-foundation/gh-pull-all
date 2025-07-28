#!/usr/bin/env node

import { TerminalSimulator, runTerminalTest } from '../demos/terminal-simulator.mjs'

// Create a minimal version of StatusDisplay for testing
const createTestableStatusDisplay = () => {
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

  // Recreate StatusDisplay class for testing
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
      
      if (this.isInteractive) {
        process.stdout.on('resize', () => {
          this.terminalWidth = process.stdout.columns || 80
          this.terminalHeight = process.stdout.rows || 24
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
        
        if (status === 'failed' && !repo.errorNumber) {
          this.errorCounter++
          repo.errorNumber = this.errorCounter
          this.errors.push({
            number: this.errorCounter,
            repo: name,
            message: message
          })
        }
        
        if (this.useInPlaceUpdates) {
          this.render()
        } else {
          this.logStatusChange(repo, oldStatus)
        }
      }
    }

    logStatusChange(repo, oldStatus) {
      if (repo.status === 'pending' || repo.status === oldStatus) {
        return
      }

      if (this.threads === 1 || (!this.liveUpdates && this.threads > 1)) {
        if (repo.status === 'pulling' || repo.status === 'cloning') {
          return
        }
      }

      const statusIcon = this.getStatusIcon(repo.status)
      const statusColor = this.getStatusColor(repo.status)
      const duration = repo.endTime ? 
        `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s` : 
        `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
      
      const baseLength = statusIcon.length + 1 + this.maxNameLength + 1 + 6 + 1
      const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10)
      
      let displayMessage = repo.message
      if (repo.status === 'failed' && repo.errorNumber) {
        displayMessage = `Error #${repo.errorNumber}: ${this.truncateMessage(repo.message, availableWidth - 10)}`
      } else {
        displayMessage = this.truncateMessage(repo.message, availableWidth)
      }
      
      const line = `${statusColor}${statusIcon} ${repo.name.padEnd(this.maxNameLength)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${displayMessage}`
      console.log(line)
      repo.logged = true
    }

    render() {
      if (!this.useInPlaceUpdates) {
        return
      }

      if (!this.headerPrinted) {
        console.log(`\n${colors.bold}Repository Status${colors.reset}`)
        console.log(`${colors.dim}${'─'.repeat(Math.min(80, this.terminalWidth))}${colors.reset}`)
        this.headerPrinted = true
      }

      // BUGGY LINE: This causes duplication when repos > terminal height
      if (this.renderedOnce && this.repos.size > 0) {
        process.stdout.write(`\x1b[${this.repos.size}A`)
      }

      const baseLength = 2 + this.maxNameLength + 1 + 6 + 1
      const availableWidth = Math.max(20, this.terminalWidth - baseLength - 10)

      for (const [name, repo] of this.repos) {
        const statusIcon = this.getStatusIcon(repo.status)
        const statusColor = this.getStatusColor(repo.status)
        const duration = repo.endTime ? 
          `${((repo.endTime - repo.startTime) / 1000).toFixed(1)}s` : 
          `${((Date.now() - repo.startTime) / 1000).toFixed(1)}s`
        
        let displayMessage = repo.message
        if (repo.status === 'failed' && repo.errorNumber) {
          displayMessage = `Error #${repo.errorNumber}: ${this.truncateMessage(repo.message, availableWidth - 10)}`
        } else {
          displayMessage = this.truncateMessage(repo.message, availableWidth)
        }
        
        const line = `${statusColor}${statusIcon}${colors.reset} ${repo.name.padEnd(this.maxNameLength)} ${colors.dim}${duration.padStart(6)}${colors.reset} ${displayMessage}`
        
        process.stdout.write('\x1b[2K')
        console.log(line)
      }
      
      this.renderedOnce = true
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
        case 'pulling': return colors.cyan
        case 'success': return colors.green
        case 'failed': return colors.red
        case 'skipped': return colors.yellow
        case 'uncommitted': return colors.yellow
        default: return colors.reset
      }
    }

    truncateMessage(message, maxLength) {
      if (!message || message.length <= maxLength) {
        return message
      }
      return message.substring(0, maxLength - 3) + '...'
    }

    printErrors() {
      if (this.errors.length === 0) {
        return
      }

      console.log()
      console.log(`${colors.red}${colors.bold}❌ Errors:${colors.reset}`)
      console.log(`${colors.dim}${'─'.repeat(Math.min(80, this.terminalWidth))}${colors.reset}`)
      
      for (const error of this.errors) {
        console.log(`${colors.red}#${error.number.toString().padStart(2)} ${colors.yellow}${error.repo}${colors.reset}: ${error.message}`)
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
          case 'uncommitted':
            summary.uncommitted++
            break
        }
      }

      this.printErrors()

      console.log()
      console.log(`${colors.blue}${colors.bold}📊 Summary:${colors.reset}`)
      if (summary.cloned > 0) console.log(`${colors.green}✅ Cloned: ${summary.cloned}${colors.reset}`)
      if (summary.pulled > 0) console.log(`${colors.green}✅ Pulled: ${summary.pulled}${colors.reset}`)
      if (summary.uncommitted > 0) console.log(`${colors.cyan}🔄 Uncommitted changes: ${summary.uncommitted}${colors.reset}`)
      if (summary.skipped > 0) console.log(`${colors.yellow}⚠️  Skipped: ${summary.skipped}${colors.reset}`)
      if (summary.failed > 0) console.log(`${colors.red}❌ Failed: ${summary.failed}${colors.reset}`)

      const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1)
      console.log(`${colors.blue}⏱️  Total time: ${totalTime}s${colors.reset}`)
      console.log(`${colors.blue}🎉 Repository sync completed!${colors.reset}`)
    }
  }
  
  return StatusDisplay
}

// Test configurations
const testConfigs = [
  {
    name: 'Small terminal with many repos',
    terminalHeight: 10,
    terminalWidth: 80,
    repoCount: 30,
    description: 'Tests behavior when repos exceed terminal height'
  },
  {
    name: 'Normal terminal with moderate repos',
    terminalHeight: 24,
    terminalWidth: 80,
    repoCount: 20,
    description: 'Tests standard terminal scenario'
  },
  {
    name: 'Large terminal with many repos',
    terminalHeight: 50,
    terminalWidth: 120,
    repoCount: 100,
    description: 'Tests performance with many repos on large terminal'
  }
]

async function simulateMultithreadUpdates(statusDisplay, repoCount, updateCycles = 5) {
  // Add all repos
  const repos = []
  for (let i = 1; i <= repoCount; i++) {
    const repoName = `test-repo-${i.toString().padStart(3, '0')}`
    repos.push(repoName)
    statusDisplay.addRepo(repoName)
  }

  // Simulate multiple update cycles like in real multithread scenario
  for (let cycle = 0; cycle < updateCycles; cycle++) {
    // Simulate concurrent updates (random repos get updated)
    const updateBatch = Math.min(8, repoCount) // Simulate 8 threads
    const shuffled = [...repos].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < updateBatch; i++) {
      const repo = shuffled[i]
      const states = ['cloning', 'pulling', 'success', 'failed']
      const state = states[cycle % states.length]
      
      statusDisplay.updateRepo(repo, state, `Cycle ${cycle + 1} update`)
    }
    
    // Small delay to simulate real timing
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  // Final update - mark all as complete
  for (const repo of repos) {
    statusDisplay.updateRepo(repo, 'success', 'Completed')
  }
}

async function runTest(config) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Test: ${config.name}`)
  console.log(`Description: ${config.description}`)
  console.log(`Terminal: ${config.terminalWidth}x${config.terminalHeight}, Repos: ${config.repoCount}`)
  console.log(`${'='.repeat(60)}\n`)

  const StatusDisplay = createTestableStatusDisplay()
  
  const terminal = await runTerminalTest(async (term, mockStdout) => {
    // Create StatusDisplay with live updates enabled
    const statusDisplay = new StatusDisplay(true, 8)
    
    // Run the simulation
    await simulateMultithreadUpdates(statusDisplay, config.repoCount)
    
    // Print summary
    statusDisplay.printSummary()
  }, { 
    width: config.terminalWidth, 
    height: config.terminalHeight 
  })

  // Analyze results
  console.log('\nAnalysis Results:')
  console.log('-----------------')
  
  const fullBuffer = terminal.getFullBuffer()
  const bufferText = fullBuffer.join('\n')
  
  // Check for duplicate repo entries
  const repoCounts = {}
  for (let i = 1; i <= config.repoCount; i++) {
    const repoName = `test-repo-${i.toString().padStart(3, '0')}`
    const pattern = new RegExp(repoName, 'g')
    const matches = bufferText.match(pattern)
    const count = matches ? matches.length : 0
    repoCounts[repoName] = count
  }

  // Find repos with excessive occurrences
  const duplicates = Object.entries(repoCounts)
    .filter(([name, count]) => count > 10) // More than 10 occurrences is likely a bug
    .sort((a, b) => b[1] - a[1])

  console.log(`Total buffer lines: ${fullBuffer.length}`)
  console.log(`Terminal scroll position: ${terminal.scrollTop}`)
  console.log(`Repos with excessive occurrences (>10): ${duplicates.length}`)

  if (duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATION DETECTED!')
    console.log('Top 5 duplicated repos:')
    duplicates.slice(0, 5).forEach(([name, count]) => {
      console.log(`  - ${name}: appears ${count} times`)
    })
  } else {
    console.log('✅ No excessive duplication detected')
  }

  // Check visible buffer
  const visibleBuffer = terminal.getVisibleBuffer()
  console.log(`\nLast ${Math.min(5, visibleBuffer.length)} visible lines:`)
  visibleBuffer.slice(-5).forEach((line, i) => {
    console.log(`  ${visibleBuffer.length - 5 + i}: ${line.trimEnd().substring(0, 60)}...`)
  })

  return { terminal, duplicates }
}

// Run all tests
async function runAllTests() {
  console.log('Terminal Rendering Tests for pull-all.mjs')
  console.log('=========================================')
  
  const results = []
  for (const config of testConfigs) {
    try {
      const result = await runTest(config)
      results.push({ config, ...result })
    } catch (error) {
      console.error(`\n❌ Test failed: ${config.name}`)
      console.error(error)
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  
  const failedTests = results.filter(r => r.duplicates && r.duplicates.length > 0)
  console.log(`Total tests: ${results.length}`)
  console.log(`Tests with duplication issues: ${failedTests.length}`)
  
  if (failedTests.length > 0) {
    console.log('\n❌ DUPLICATION BUG CONFIRMED!')
    console.log('The issue occurs when:')
    failedTests.forEach(result => {
      console.log(`  - ${result.config.name}: ${result.duplicates.length} repos duplicated`)
    })
    console.log('\nRoot cause: Cursor movement logic doesn\'t properly handle scrolling')
    console.log('when repository count exceeds terminal height.')
  } else {
    console.log('\n✅ All tests passed - no duplication detected')
  }
}

// Run tests
runAllTests().catch(console.error)