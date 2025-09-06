#!/usr/bin/env node

// Demo showing the fix for issue #19: "Long error output in status"
// This shows how error messages are now displayed as "Error #X" instead of long truncated messages

console.log('=== Demo: Issue #19 Fix - Short Error Display ===\n')

console.log('BEFORE (Issue #19):')
console.log('❌ boolean                                  1.2s Error: Your configuration specifies t...')
console.log('❌ deep-game                                1.2s Error: Your configuration specifies t...')
console.log('')

console.log('AFTER (Issue #19 Fixed):')
console.log('❌ boolean                                  1.2s Error #1')
console.log('❌ deep-game                                1.2s Error #2')
console.log('')

console.log('The full error details are still available in the errors section at the end:')
console.log('')
console.log('❌ Errors:')
console.log('────────────────────────────────────────────────────────────────────────────────')
console.log('# 1 boolean: Error: Your configuration specifies to merge with the ref \'refs/heads/main\'')
console.log('from the remote, but no such ref was fetched.')
console.log('')
console.log('# 2 deep-game: Error: Your configuration specifies to merge with the ref \'refs/heads/main\'')
console.log('from the remote, but no such ref was fetched.')
console.log('')

console.log('✅ Issue #19 resolved: Status now shows "Error #X" instead of long truncated messages')
console.log('✅ Full error details remain available in the dedicated errors section')
console.log('✅ Status display is cleaner and more readable')