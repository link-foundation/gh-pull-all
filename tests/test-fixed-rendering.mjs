#!/usr/bin/env node

// Test the fixed rendering implementation
import { spawn } from 'child_process'
import path from 'path'
import { tmpdir } from 'os'

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

console.log(`${colors.bold}Testing Fixed Terminal Rendering${colors.reset}`)
console.log('=' .repeat(50))

// Test configurations
const tests = [
  {
    name: 'Small Terminal Test',
    env: { LINES: '10', COLUMNS: '80' },
    description: 'Simulates small terminal where repos exceed height'
  },
  {
    name: 'Normal Terminal Test', 
    env: { LINES: '24', COLUMNS: '80' },
    description: 'Simulates standard terminal size'
  },
  {
    name: 'Large Terminal Test',
    env: { LINES: '50', COLUMNS: '120' },
    description: 'Simulates large terminal with plenty of space'
  }
]

async function runTest(test) {
  console.log(`\n${colors.blue}${test.name}${colors.reset}`)
  console.log(`${colors.dim}${test.description}${colors.reset}`)
  console.log(`Terminal: ${test.env.COLUMNS}x${test.env.LINES}`)
  console.log('-'.repeat(50))

  return new Promise((resolve, reject) => {
    // Run pull-all with test user (octocat has public repos)
    const child = spawn('node', [
      path.join(process.cwd(), 'pull-all.mjs'),
      '--user', 'octocat',
      '--threads', '4',
      '--live-updates',
      '--dir', path.join(tmpdir(), 'pull-all-test-fixed')
    ], {
      env: { ...process.env, ...test.env },
      stdio: 'pipe'
    })

    let output = ''
    let errorOutput = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
      process.stdout.write(data)
    })

    child.stderr.on('data', (data) => {
      errorOutput += data.toString()
      process.stderr.write(data)
    })

    child.on('close', (code) => {
      console.log(`\n${colors.dim}Exit code: ${code}${colors.reset}`)
      
      // Analyze output
      if (output.includes('Switching to append-only mode')) {
        console.log(`${colors.green}✅ Correctly detected terminal overflow and switched modes${colors.reset}`)
      }
      
      // Check for duplication patterns
      const lines = output.split('\n')
      const repoOccurrences = {}
      
      lines.forEach(line => {
        const repoMatch = line.match(/test-repo-\d+|octocat\/[\w-]+/)
        if (repoMatch) {
          const repo = repoMatch[0]
          repoOccurrences[repo] = (repoOccurrences[repo] || 0) + 1
        }
      })
      
      const duplicates = Object.entries(repoOccurrences)
        .filter(([repo, count]) => count > 10)
        .length
      
      if (duplicates > 0) {
        console.log(`${colors.red}❌ Found ${duplicates} repositories with excessive duplication${colors.reset}`)
      } else {
        console.log(`${colors.green}✅ No excessive duplication detected${colors.reset}`)
      }
      
      resolve({ code, output, errorOutput, duplicates })
    })

    child.on('error', reject)
  })
}

async function main() {
  console.log('This test verifies the terminal rendering fix by running pull-all')
  console.log('with different terminal sizes and checking for duplication.\n')

  const results = []

  for (const test of tests) {
    try {
      const result = await runTest(test)
      results.push({ test, ...result })
    } catch (error) {
      console.error(`${colors.red}Test failed: ${error.message}${colors.reset}`)
      results.push({ test, error })
    }
  }

  // Summary
  console.log(`\n${colors.bold}Summary${colors.reset}`)
  console.log('='.repeat(50))
  
  const passed = results.filter(r => !r.error && r.duplicates === 0).length
  console.log(`Total tests: ${results.length}`)
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`)
  console.log(`${colors.red}Failed: ${results.length - passed}${colors.reset}`)

  if (passed === results.length) {
    console.log(`\n${colors.green}${colors.bold}✅ All tests passed! The rendering fix is working correctly.${colors.reset}`)
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ Some tests failed. The rendering issue may still exist.${colors.reset}`)
  }

  // Cleanup
  try {
    const { rm } = await import('fs/promises')
    await rm(path.join(tmpdir(), 'pull-all-test-fixed'), { recursive: true, force: true })
    console.log(`\n${colors.dim}Cleaned up test directory${colors.reset}`)
  } catch (e) {
    // Ignore cleanup errors
  }
}

main().catch(console.error)