#!/usr/bin/env node

// Debug argument parsing
console.log('process.argv:', process.argv)
console.log('Node version:', process.version)

// Minimal yargs test
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());
const { default: yargs } = await use('yargs@17.7.2')
const { hideBin } = await use('yargs@17.7.2/helpers')

const argv = yargs(hideBin(process.argv))
  .option('threads', {
    alias: 'j',
    type: 'number',
    describe: 'Number of concurrent operations (default: 8)',
    default: 8
  })
  .option('user', {
    alias: 'u',  
    type: 'string',
    describe: 'GitHub username'
  })
  .parse()

console.log('Parsed argv:', argv)
console.log('threads value:', argv.threads)
console.log('j value:', argv.j)

// Test destructuring like in the main script
const { threads } = argv
console.log('destructured threads:', threads)