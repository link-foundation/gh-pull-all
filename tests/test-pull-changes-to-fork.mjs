#!/usr/bin/env node

// Test for --pull-changes-to-fork CLI option
import { execSync } from 'child_process'

const scriptName = './gh-pull-all.mjs'

async function testPullChangesToForkValidation() {
  console.log('Testing --pull-changes-to-fork CLI validation...')
  
  const testCases = [
    {
      name: 'Conflicting with --pull-from-default',
      args: '--user test --pull-changes-to-fork --pull-from-default',
      expectedError: 'Cannot specify both --pull-changes-to-fork and --pull-from-default'
    },
    {
      name: 'Conflicting with --switch-to-default',
      args: '--user test --pull-changes-to-fork --switch-to-default',
      expectedError: 'Cannot specify both --pull-changes-to-fork and --switch-to-default'
    }
  ]
  
  let passed = 0
  let failed = 0
  
  for (const testCase of testCases) {
    try {
      const command = `node ${scriptName} ${testCase.args}`
      execSync(command, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 })
      
      console.log(`❌ FAILED: ${testCase.name} - Expected error but command succeeded`)
      failed++
    } catch (error) {
      if (error.message.includes(testCase.expectedError)) {
        console.log(`✅ PASSED: ${testCase.name}`)
        passed++
      } else {
        console.log(`❌ FAILED: ${testCase.name} - Got unexpected error: ${error.message}`)
        failed++
      }
    }
  }
  
  console.log(`\nValidation Results: ${passed} passed, ${failed} failed`)
  return failed === 0
}

async function testHelpOutput() {
  console.log('\nTesting --pull-changes-to-fork in help output...')
  
  try {
    const helpOutput = execSync(`node ${scriptName} --help`, { encoding: 'utf8', stdio: 'pipe' })
    
    if (helpOutput.includes('--pull-changes-to-fork')) {
      console.log('✅ PASSED: --pull-changes-to-fork found in help output')
      return true
    } else {
      console.log('❌ FAILED: --pull-changes-to-fork not found in help output')
      return false
    }
  } catch (error) {
    // execSync throws an error even for --help due to missing required args
    // But we can still check the error output which contains the help text
    const errorOutput = error.stdout || error.stderr || error.message || ''
    if (errorOutput.includes('--pull-changes-to-fork')) {
      console.log('✅ PASSED: --pull-changes-to-fork found in help output')
      return true
    } else {
      console.log('❌ FAILED: --pull-changes-to-fork not found in help output')
      console.log('Full error message:', error.message)
      console.log('Stdout:', error.stdout)
      console.log('Stderr:', error.stderr)
      return false
    }
  }
}

async function main() {
  console.log('🧪 Running tests for --pull-changes-to-fork functionality\n')
  
  const validationPassed = await testPullChangesToForkValidation()
  const helpPassed = await testHelpOutput()
  
  const allPassed = validationPassed && helpPassed
  
  console.log('\n📊 Overall Results:')
  console.log(`Validation: ${validationPassed ? '✅ PASSED' : '❌ FAILED'}`)
  console.log(`Help Output: ${helpPassed ? '✅ PASSED' : '❌ FAILED'}`)
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)
  
  process.exit(allPassed ? 0 : 1)
}

main().catch(error => {
  console.error('Test suite failed:', error.message)
  process.exit(1)
})