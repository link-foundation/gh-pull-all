#!/usr/bin/env bun

// Test runner script
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

async function main() {
  log('blue', '🧪 Running pull-all tests...\n')
  
  // Find all test files
  const testFiles = await fs.readdir('.')
  const testFilePattern = /^test-.*\.mjs$/
  const tests = testFiles.filter(file => testFilePattern.test(file))
  
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
  
  // Run tests sequentially to avoid conflicts
  for (const testFile of tests) {
    log('blue', `Running ${testFile}...`)
    const result = await runTest(testFile)
    results.push(result)
    
    if (result.code === 0) {
      log('green', `✅ ${testFile} passed (${result.duration}ms)`)
      passed++
    } else {
      log('red', `❌ ${testFile} failed (${result.duration}ms)`)
      if (result.stderr) {
        console.log(`${colors.red}   Error: ${result.stderr.trim()}${colors.reset}`)
      }
      failed++
    }
  }
  
  console.log()
  log('blue', '📊 Test Summary:')
  log('green', `✅ Passed: ${passed}`)
  if (failed > 0) {
    log('red', `❌ Failed: ${failed}`)
  }
  
  const totalDuration = results.reduce((sum, result) => sum + result.duration, 0)
  log('cyan', `⏱️  Total time: ${totalDuration}ms`)
  
  if (failed > 0) {
    console.log()
    log('red', 'Failed tests:')
    results
      .filter(result => result.code !== 0)
      .forEach(result => {
        log('red', `  • ${result.file}`)
        if (result.stdout) {
          console.log(`    Output: ${result.stdout.trim()}`)
        }
      })
    
    process.exit(1)
  } else {
    log('green', '\n🎉 All tests passed!')
  }
}

main().catch(error => {
  log('red', `💥 Test runner failed: ${error.message}`)
  process.exit(1)
})