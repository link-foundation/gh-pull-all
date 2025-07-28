#!/usr/bin/env node

import { EventEmitter } from 'events'

// Terminal simulator for testing rendering without GitHub API
export class TerminalSimulator extends EventEmitter {
  constructor(options = {}) {
    super()
    this.width = options.width || 80
    this.height = options.height || 24
    this.buffer = []
    this.cursorY = 0
    this.cursorX = 0
    this.savedCursorY = 0
    this.savedCursorX = 0
    this.scrollTop = 0
    this.ansiRegex = /\x1b\[[^m]*m/g
    this.cursorRegex = /\x1b\[(\d*)([ABCDEFGJKST])/g
    this.clearRegex = /\x1b\[([012]?)K/g
    this.output = []
    this.rawOutput = []
  }

  write(data) {
    this.rawOutput.push(data)
    
    // Process ANSI escape sequences
    let processed = data
    
    // Handle cursor movement
    processed = processed.replace(this.cursorRegex, (match, count, code) => {
      const n = parseInt(count) || 1
      switch (code) {
        case 'A': // Cursor up
          this.cursorY = Math.max(0, this.cursorY - n)
          break
        case 'B': // Cursor down
          this.cursorY = Math.min(this.height - 1, this.cursorY + n)
          break
        case 'C': // Cursor forward
          this.cursorX = Math.min(this.width - 1, this.cursorX + n)
          break
        case 'D': // Cursor backward
          this.cursorX = Math.max(0, this.cursorX - n)
          break
        case 'E': // Cursor next line
          this.cursorY = Math.min(this.height - 1, this.cursorY + n)
          this.cursorX = 0
          break
        case 'F': // Cursor previous line
          this.cursorY = Math.max(0, this.cursorY - n)
          this.cursorX = 0
          break
        case 'G': // Cursor horizontal absolute
          this.cursorX = Math.min(this.width - 1, Math.max(0, n - 1))
          break
        case 'S': // Save cursor position
          this.savedCursorY = this.cursorY
          this.savedCursorX = this.cursorX
          break
        case 'T': // Restore cursor position
          this.cursorY = this.savedCursorY
          this.cursorX = this.savedCursorX
          break
      }
      return ''
    })
    
    // Handle line clearing
    processed = processed.replace(this.clearRegex, (match, mode) => {
      const actualY = this.scrollTop + this.cursorY
      if (!this.buffer[actualY]) {
        this.buffer[actualY] = ' '.repeat(this.width)
      }
      
      switch (mode) {
        case '': // Clear from cursor to end of line
        case '0':
          this.buffer[actualY] = 
            this.buffer[actualY].substring(0, this.cursorX) + 
            ' '.repeat(this.width - this.cursorX)
          break
        case '1': // Clear from beginning of line to cursor
          this.buffer[actualY] = 
            ' '.repeat(this.cursorX + 1) + 
            this.buffer[actualY].substring(this.cursorX + 1)
          break
        case '2': // Clear entire line
          this.buffer[actualY] = ' '.repeat(this.width)
          break
      }
      return ''
    })
    
    // Remove ANSI color codes for buffer storage
    processed = processed.replace(this.ansiRegex, '')
    
    // Handle newlines and text
    const lines = processed.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        this.newLine()
      }
      
      const line = lines[i]
      if (line.length > 0) {
        this.addText(line)
      }
    }
    
    this.emit('write', data)
  }

  newLine() {
    this.cursorY++
    this.cursorX = 0
    
    // Handle scrolling
    if (this.cursorY >= this.height) {
      this.scrollTop++
      this.cursorY = this.height - 1
      this.emit('scroll', this.scrollTop)
    }
  }

  addText(text) {
    const actualY = this.scrollTop + this.cursorY
    if (!this.buffer[actualY]) {
      this.buffer[actualY] = ' '.repeat(this.width)
    }
    
    // Ensure we don't exceed line width
    const remainingSpace = this.width - this.cursorX
    const textToAdd = text.substring(0, remainingSpace)
    
    // Replace characters at cursor position
    this.buffer[actualY] = 
      this.buffer[actualY].substring(0, this.cursorX) + 
      textToAdd + 
      this.buffer[actualY].substring(this.cursorX + textToAdd.length)
    
    this.cursorX += textToAdd.length
    
    // Handle text wrapping if needed
    if (text.length > remainingSpace) {
      this.newLine()
      this.addText(text.substring(remainingSpace))
    }
  }

  getVisibleBuffer() {
    const start = this.scrollTop
    const end = start + this.height
    const visible = []
    
    for (let i = start; i < end; i++) {
      visible.push(this.buffer[i] || ' '.repeat(this.width))
    }
    
    return visible
  }

  getFullBuffer() {
    return this.buffer.slice()
  }

  getRawOutput() {
    return this.rawOutput.join('')
  }

  clear() {
    this.buffer = []
    this.cursorY = 0
    this.cursorX = 0
    this.scrollTop = 0
    this.output = []
    this.rawOutput = []
  }

  resize(width, height) {
    this.width = width
    this.height = height
    this.emit('resize', { width, height })
  }

  // Count occurrences of a pattern in visible buffer
  countInVisible(pattern) {
    const visible = this.getVisibleBuffer().join('\n')
    const matches = visible.match(new RegExp(pattern, 'g'))
    return matches ? matches.length : 0
  }

  // Count occurrences in full buffer
  countInFull(pattern) {
    const full = this.buffer.join('\n')
    const matches = full.match(new RegExp(pattern, 'g'))
    return matches ? matches.length : 0
  }

  // Get cursor position relative to visible area
  getCursorPosition() {
    return {
      x: this.cursorX,
      y: this.cursorY,
      absoluteY: this.scrollTop + this.cursorY
    }
  }
}

// Mock stdout for testing
export class MockStdout {
  constructor(terminal) {
    this.terminal = terminal
    this.isTTY = true
    this.columns = terminal.width
    this.rows = terminal.height
  }

  write(data) {
    this.terminal.write(data)
    return true
  }

  on(event, handler) {
    if (event === 'resize') {
      this.terminal.on('resize', ({ width, height }) => {
        this.columns = width
        this.rows = height
        handler()
      })
    }
  }
}

// Test runner for terminal rendering
export async function runTerminalTest(testFn, options = {}) {
  const terminal = new TerminalSimulator(options)
  const mockStdout = new MockStdout(terminal)
  
  // Replace process.stdout temporarily
  const originalStdout = process.stdout
  const originalWrite = console.log
  
  process.stdout = mockStdout
  console.log = (...args) => {
    mockStdout.write(args.join(' ') + '\n')
  }
  
  try {
    await testFn(terminal, mockStdout)
  } finally {
    // Restore original stdout
    process.stdout = originalStdout
    console.log = originalWrite
  }
  
  return terminal
}

// Demo test if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = async () => {
    console.log('Terminal Simulator Demo')
    console.log('======================')
    
    const terminal = await runTerminalTest(async (term) => {
      // Simulate StatusDisplay output
      console.log('\nRepository Status')
      console.log('─'.repeat(40))
      
      // Simulate multiple repo updates
      const repos = []
      for (let i = 1; i <= 30; i++) {
        repos.push(`repo-${i}`)
        console.log(`⏳ repo-${i.toString().padStart(2, '0')}  0.0s Pending...`)
      }
      
      // Simulate cursor movement and updates
      for (let i = 0; i < 5; i++) {
        // Move cursor up by number of repos
        process.stdout.write(`\x1b[${repos.length}A`)
        
        // Update each repo
        for (let j = 0; j < repos.length; j++) {
          process.stdout.write('\x1b[2K') // Clear line
          const status = i % 2 === 0 ? '📦' : '✅'
          const time = `${(i * 0.5 + j * 0.1).toFixed(1)}s`
          console.log(`${status} repo-${(j + 1).toString().padStart(2, '0')}  ${time} ${i % 2 === 0 ? 'Cloning...' : 'Done'}`)
        }
      }
    }, { width: 80, height: 10 }) // Small terminal height to test scrolling
    
    console.log('\n\nTerminal Analysis:')
    console.log('==================')
    console.log(`Terminal size: ${terminal.width}x${terminal.height}`)
    console.log(`Total lines in buffer: ${terminal.buffer.length}`)
    console.log(`Scroll position: ${terminal.scrollTop}`)
    console.log(`Cursor position: Y=${terminal.cursorY}, X=${terminal.cursorX}`)
    
    console.log('\nVisible buffer (last 10 lines):')
    console.log('--------------------------------')
    const visible = terminal.getVisibleBuffer()
    visible.forEach((line, i) => {
      console.log(`${i.toString().padStart(2)}: ${line.trimEnd()}`)
    })
    
    // Check for duplicates
    const fullBuffer = terminal.getFullBuffer().join('\n')
    const repoPattern = /repo-01/g
    const matches = fullBuffer.match(repoPattern)
    console.log(`\nOccurrences of 'repo-01': ${matches ? matches.length : 0}`)
    
    if (matches && matches.length > 5) {
      console.log('⚠️  Warning: Potential duplicate rendering detected!')
    }
  }
  
  demo().catch(console.error)
}