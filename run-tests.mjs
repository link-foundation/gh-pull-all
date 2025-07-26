#!/usr/bin/env node

// Simple runner to execute all tests from the root directory
import { execSync } from 'child_process'

console.log('Running all tests...\n')

try {
  execSync('node tests/test-all.mjs', { stdio: 'inherit' })
} catch (error) {
  process.exit(1)
}