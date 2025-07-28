#!/usr/bin/env node

// Demonstrates the terminal rendering bug in pull-all.mjs
// This simulates what happens when repos exceed terminal height

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

console.log('Demonstrating Terminal Rendering Bug')
console.log('====================================')
console.log('This simulates what happens in multithread mode with live updates')
console.log('when the number of repositories exceeds the terminal height.\n')

// Get terminal dimensions
const terminalHeight = process.stdout.rows || 24
const terminalWidth = process.stdout.columns || 80

console.log(`Your terminal: ${terminalWidth}x${terminalHeight}`)
console.log('Press Ctrl+C to stop the demonstration\n')

// Wait a moment
await new Promise(resolve => setTimeout(resolve, 2000))

// Simulate StatusDisplay behavior
const repoCount = 40 // More than typical terminal height
const repos = []

console.log(`\n${colors.bold}Repository Status${colors.reset}`)
console.log(`${colors.dim}${'─'.repeat(Math.min(80, terminalWidth))}${colors.reset}`)

// Initial render - show all repos as pending
for (let i = 1; i <= repoCount; i++) {
  const repoName = `repo-${i.toString().padStart(3, '0')}`
  repos.push(repoName)
  console.log(`⏳ ${repoName.padEnd(20)} ${colors.dim}  0.0s${colors.reset} Pending...`)
}

console.log('\n--- Initial render complete ---')
console.log(`Rendered ${repoCount} repositories`)
console.log(`Terminal height: ${terminalHeight}`)
console.log(`Overflow: ${repoCount - terminalHeight} lines\n`)

await new Promise(resolve => setTimeout(resolve, 2000))

// Now simulate the BUG: try to update by moving cursor up
console.log('Now simulating the bug: attempting to move cursor up by repo count...')
console.log(`Executing: \\x1b[${repoCount}A (move up ${repoCount} lines)`)
console.log('But terminal can only see the last', terminalHeight, 'lines!')
console.log('This causes duplication...\n')

await new Promise(resolve => setTimeout(resolve, 2000))

// Demonstrate the bug - this is what StatusDisplay.render() does
for (let cycle = 0; cycle < 3; cycle++) {
  // Move cursor up by repo count (THIS IS THE BUG!)
  process.stdout.write(`\x1b[${repoCount}A`)
  
  // Update each repo
  for (let i = 1; i <= repoCount; i++) {
    const repoName = `repo-${i.toString().padStart(3, '0')}`
    const status = cycle % 2 === 0 ? '📦' : '✅'
    const time = `${(cycle + 1).toFixed(1)}s`
    
    process.stdout.write('\x1b[2K') // Clear line
    console.log(`${status} ${repoName.padEnd(20)} ${colors.dim}${time.padStart(6)}${colors.reset} ${cycle % 2 === 0 ? 'Cloning...' : 'Done'}`)
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500))
}

console.log('\n--- Bug Demonstration Complete ---')
console.log('\nWhat happened:')
console.log('1. We tried to move cursor up by', repoCount, 'lines')
console.log('2. But terminal can only display', terminalHeight, 'lines')
console.log('3. Cursor movement fails when exceeding visible area')
console.log('4. This causes old content to not be properly cleared')
console.log('5. Result: duplicate rendering of repository status')

console.log('\nSolution:')
console.log('- Track visible window separately from total repos')
console.log('- Only update visible portion of the list')
console.log('- Use alternative rendering strategy for large lists')
console.log('- Or disable in-place updates when repos > terminal height')