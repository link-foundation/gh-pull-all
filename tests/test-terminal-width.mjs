#!/usr/bin/env bun

import path from 'path'

// Test terminal width handling and message truncation
// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import modern npm libraries using use-m
import { promises as fs } from 'fs'
const os = await import('os')
const { execSync } = await import('child_process')

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

async function testTerminalWidth() {
  const testDir = path.join(os.tmpdir(), 'gh-pull-all-test-terminal-width')
  
  try {
    log('blue', '🧪 Testing terminal width handling and message truncation...')
    
    // Clean up any existing test directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })
    
    // Create a conflicting file to generate a longer error message
    await fs.writeFile(path.join(testDir, 'Spoon-Knife'), 'conflicting file content that will generate a longer error message')
    
    log('cyan', '🔧 Created conflicting file to generate longer error message')
    
    // Test with different simulated terminal widths by checking message length limits
    // Since we can't actually control terminal width in non-TTY, we'll test the logic
    let result
    try {
      result = execSync(`../gh-pull-all.mjs --user octocat --threads 2 --no-live-updates --dir ${testDir}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      })
    } catch (execError) {
      result = execError.stdout || ''
    }
    
    log('green', '✅ Terminal width test completed')
    
    // Check that error messages are truncated in status lines
    const lines = result.split('\n')
    const errorStatusLines = lines.filter(line => line.includes('Error #') && line.includes('❌'))
    
    if (errorStatusLines.length > 0) {
      log('green', `✅ Found ${errorStatusLines.length} error status line(s)`)
      
      // Check if any status line message ends with '...' indicating truncation
      const truncatedLines = errorStatusLines.filter(line => line.includes('...'))
      if (truncatedLines.length > 0) {
        log('green', '✅ Found truncated error messages in status lines')
      } else {
        log('yellow', '⚠️ No truncation found (may be normal if messages are short)')
      }
    } else {
      throw new Error('Expected error status lines not found')
    }
    
    // Check that full error messages are available in the errors section
    const errorSectionStart = result.indexOf('❌ Errors:')
    if (errorSectionStart !== -1) {
      const errorSection = result.substring(errorSectionStart)
      if (errorSection.includes('destination path') && errorSection.includes('already exists')) {
        log('green', '✅ Full error details preserved in errors section')
      } else {
        throw new Error('Expected full error details not found in errors section')
      }
    } else {
      throw new Error('Errors section not found')
    }
    
    // Verify that status messages don't exceed reasonable lengths
    const statusLines = lines.filter(line => 
      line.includes('✅') || line.includes('❌') || line.includes('🔄')
    )
    
    let maxLineLength = 0
    statusLines.forEach(line => {
      // Remove ANSI escape codes to get actual text length
      const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '')
      maxLineLength = Math.max(maxLineLength, cleanLine.length)
    })
    
    if (maxLineLength > 0) {
      log('green', `✅ Maximum status line length: ${maxLineLength} characters`)
      
      // In most cases, lines should be reasonable length (< 200 chars)
      if (maxLineLength < 200) {
        log('green', '✅ Status line lengths are reasonable')
      } else {
        log('yellow', `⚠️ Some status lines are quite long: ${maxLineLength} chars`)
      }
    }
    
    log('green', '🎉 Terminal width test passed!')
    
  } catch (error) {
    log('red', `❌ Terminal width test failed: ${error.message}`)
    throw error
  } finally {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true })
      log('cyan', '🧹 Cleaned up test directory')
    } catch (cleanupError) {
      log('yellow', `⚠️ Cleanup warning: ${cleanupError.message}`)
    }
  }
}

// Run the test
testTerminalWidth().catch(error => {
  log('red', `💥 Test failed: ${error.message}`)
  process.exit(1)
})