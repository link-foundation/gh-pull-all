#!/usr/bin/env node

// Import the status display logic from the main script to test
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Simple test of the StatusDisplay class to verify error number display
class StatusDisplay {
  constructor() {
    this.repos = new Map()
    this.errors = []
    this.errorCounter = 0
    this.maxNameLength = 20
    this.terminalWidth = 80
  }

  addRepo(name) {
    this.repos.set(name, {
      name,
      status: 'pending',
      message: '',
      errorNumber: null
    })
  }

  updateRepo(name, status, message = '') {
    const repo = this.repos.get(name)
    if (repo) {
      repo.status = status
      repo.message = message
      
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
      
      this.logStatusChange(repo)
    }
  }

  logStatusChange(repo) {
    const statusIcon = repo.status === 'failed' ? '❌' : '✅'
    const duration = '1.2s'
    
    // This is the key logic we need to test
    let displayMessage = repo.message
    if (repo.status === 'failed' && repo.errorNumber) {
      displayMessage = `Error #${repo.errorNumber}`
    }
    
    const line = `${statusIcon} ${repo.name.padEnd(this.maxNameLength)} ${duration.padStart(6)} ${displayMessage}`
    console.log(line)
  }
}

// Test the current behavior
console.log('Testing current error display behavior:')
const display = new StatusDisplay()

// Add some test repos
display.addRepo('boolean')
display.addRepo('deep-game')

// Simulate failures
display.updateRepo('boolean', 'failed', 'Error: Your configuration specifies to merge with the ref \'refs/heads/main\' from the remote, but no such ref was fetched.')
display.updateRepo('deep-game', 'failed', 'Error: Your configuration specifies to merge with the ref \'refs/heads/main\' from the remote, but no such ref was fetched.')

console.log('\nExpected output should show "Error #1" and "Error #2" instead of the full error messages.')