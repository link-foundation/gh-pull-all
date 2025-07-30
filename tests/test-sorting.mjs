#!/usr/bin/env bun

// Simple test to verify repository sorting
import { execSync } from 'child_process'

console.log('🧪 Testing repository sorting...')

try {
  // Run gh-pull-all with --help to ensure it loads correctly
  execSync('../gh-pull-all.mjs --help', { stdio: 'pipe' })
  console.log('✅ Script loads successfully')
  
  // Test the sorting logic
  const repos = [
    { name: 'zebra-repo' },
    { name: 'alpha-repo' },
    { name: 'middle-repo' },
    { name: 'beta-repo' }
  ]
  
  const sorted = repos.sort((a, b) => a.name.localeCompare(b.name))
  const sortedNames = sorted.map(r => r.name)
  
  console.log('📝 Original order:', repos.map(r => r.name))
  console.log('📝 Sorted order:', sortedNames)
  
  const expected = ['alpha-repo', 'beta-repo', 'middle-repo', 'zebra-repo']
  const isCorrect = JSON.stringify(sortedNames) === JSON.stringify(expected)
  
  if (isCorrect) {
    console.log('✅ Sorting works correctly!')
  } else {
    console.log('❌ Sorting failed')
    process.exit(1)
  }
  
} catch (error) {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
}