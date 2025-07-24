#!/usr/bin/env bun

// Main test runner script - executes all tests
const useJs = await fetch('https://unpkg.com/use-m/use.js')
const { use } = eval(await useJs.text())

const fs = await use('fs-extra@latest')
const path = await use('path@latest')
const { spawn } = await import('child_process')

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)

async function runTest(testFile) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const child = spawn('bun', [testFile], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime
      resolve({
        file: testFile,
        code,
        stdout,
        stderr,
        duration
      })
    })
    
    child.on('error', (error) => {
      const duration = Date.now() - startTime
      resolve({
        file: testFile,
        code: 1,
        stdout: '',
        stderr: error.message,
        duration
      })
    })
  })
}

async function checkDependencies() {
  log('blue', '🔍 Checking dependencies...')
  
  try {
    // Check if bun is available
    const bunCheck = spawn('bun', ['--version'], { stdio: 'pipe' })
    await new Promise((resolve, reject) => {
      bunCheck.on('close', (code) => {
        if (code === 0) {
          log('green', '✅ Bun runtime available')
          resolve()
        } else {
          reject(new Error('Bun not found'))
        }
      })
      bunCheck.on('error', reject)
    })
    
    // Check internet connectivity for use-m
    const testFetch = await fetch('https://unpkg.com/use-m/use.js', { method: 'HEAD' })
    if (testFetch.ok) {
      log('green', '✅ Internet connectivity available')
    } else {
      throw new Error('Cannot reach unpkg.com')
    }
    
    return true
  } catch (error) {
    log('red', `❌ Dependency check failed: ${error.message}`)
    return false
  }
}

async function main() {
  console.log(`${colors.magenta}
╔══════════════════════════════════════╗
║        Pull-All Test Suite           ║
╚══════════════════════════════════════╝${colors.reset}
`)
  
  // Check dependencies first
  const depsOk = await checkDependencies()
  if (!depsOk) {
    log('red', '💥 Cannot proceed without required dependencies')
    process.exit(1)
  }
  
  console.log()
  log('blue', '🧪 Discovering test files...')
  
  // Find all test files (excluding test-all.mjs)
  const testFiles = await fs.readdir('.')
  const testFilePattern = /^test-.*\.mjs$/
  const tests = testFiles.filter(file => 
    testFilePattern.test(file) && file !== 'test-all.mjs'
  ).sort()
  
  if (tests.length === 0) {
    log('yellow', '⚠️  No test files found')
    return
  }
  
  log('cyan', `Found ${tests.length} test files:`)
  tests.forEach(test => log('cyan', `  • ${test}`))
  console.log()
  
  const results = []
  let passed = 0
  let failed = 0
  let totalTests = 0
  
  log('blue', '🚀 Running tests...')
  console.log()
  
  // Run tests sequentially to avoid conflicts
  for (let i = 0; i < tests.length; i++) {
    const testFile = tests[i]
    log('blue', `[${i + 1}/${tests.length}] Running ${testFile}...`)
    
    const result = await runTest(testFile)
    results.push(result)
    
    // Parse test output to count individual tests
    const testCount = (result.stdout.match(/✓/g) || []).length
    totalTests += testCount
    
    if (result.code === 0) {
      log('green', `✅ ${testFile} passed (${result.duration}ms, ${testCount} tests)`)
      passed++
    } else {
      log('red', `❌ ${testFile} failed (${result.duration}ms)`)
      if (result.stderr) {
        const errorLines = result.stderr.trim().split('\n')
        errorLines.forEach(line => {
          if (line.trim()) {
            console.log(`${colors.red}   ${line}${colors.reset}`)
          }
        })
      }
      failed++
    }
    console.log()
  }
  
  // Summary
  log('blue', '═'.repeat(50))
  log('blue', '📊 Test Summary:')
  log('green', `✅ Test files passed: ${passed}`)
  if (failed > 0) {
    log('red', `❌ Test files failed: ${failed}`)
  }
  log('cyan', `🧪 Total individual tests: ${totalTests}`)
  
  const totalDuration = results.reduce((sum, result) => sum + result.duration, 0)
  log('cyan', `⏱️  Total execution time: ${totalDuration}ms`)
  
  if (failed > 0) {
    console.log()
    log('red', '💔 Failed test files:')
    results
      .filter(result => result.code !== 0)
      .forEach(result => {
        log('red', `  • ${result.file}`)
        if (result.stdout && result.stdout.includes('✗')) {
          const failedTests = result.stdout.split('\n').filter(line => line.includes('✗'))
          failedTests.forEach(test => {
            console.log(`    ${colors.red}${test.trim()}${colors.reset}`)
          })
        }
      })
    
    console.log()
    log('red', '💥 Some tests failed!')
    process.exit(1)
  } else {
    console.log()
    log('green', '🎉 All tests passed successfully!')
    log('cyan', '✨ The pull-all script is ready for use!')
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  log('red', `💥 Uncaught exception: ${error.message}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('red', `💥 Unhandled rejection: ${reason}`)
  process.exit(1)
})

main().catch(error => {
  log('red', `💥 Test runner failed: ${error.message}`)
  process.exit(1)
})