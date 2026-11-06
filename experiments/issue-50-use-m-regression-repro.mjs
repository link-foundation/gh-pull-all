#!/usr/bin/env node
// Minimal, self-contained reproduction of the use-m 8.16.3 backward-compatibility
// regression behind https://github.com/link-foundation/gh-pull-all/issues/50.
//
//   node experiments/issue-50-use-m-regression-repro.mjs 8.16.2   # OK
//   node experiments/issue-50-use-m-regression-repro.mjs 8.16.3   # FAIL
//   node experiments/issue-50-use-m-regression-repro.mjs          # latest
const version = process.argv[2]
const url = `https://unpkg.com/use-m${version ? '@' + version : ''}/use.js`
const response = await fetch(url)
const { use } = eval(await response.text())
console.log(`use-m: ${response.url}`)

let failed = false
const check = (label, fn) => {
  try {
    const result = fn()
    console.log(`  OK   ${label}${result ? ` (${result})` : ''}`)
  } catch (error) {
    failed = true
    console.log(`  FAIL ${label}: ${error.constructor.name}: ${error.message.split('\n')[0]}`)
  }
}

// 1. Default export of a package whose `exports` has an `import` condition.
const yargsModule = await use('yargs@17.7.2')
check("const { default: yargs } = await use('yargs@17.7.2'); yargs([])", () => {
  const { default: yargs } = yargsModule
  return typeof yargs([]).parse
})

// 2. Physical (unexported) subpath that used to resolve.
try {
  const ink = await use('ink@5.2.1/build/index.js')
  check("use('ink@5.2.1/build/index.js')", () => typeof ink.render)
} catch (error) {
  failed = true
  console.log(`  FAIL use('ink@5.2.1/build/index.js'): ${error.message.split('\n')[0]}`)
}

process.exitCode = failed ? 1 : 0
