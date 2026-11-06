#!/usr/bin/env node
// Reproduction for https://github.com/link-foundation/gh-pull-all/issues/50
// Shows the shape of the module object that use-m returns for yargs.
// Usage: node experiments/issue-50-yargs-shape.mjs [use-m-version]
const version = process.argv[2] || ''
const url = `https://unpkg.com/use-m${version ? '@' + version : ''}/use.js`
const src = await (await fetch(url)).text()
const exported = eval(src)
const { use } = exported
console.log('use-m source:', url)
for (const spec of ['yargs@17.7.2', 'yargs@17.7.2/helpers', 'simple-git@3.28.0', 'fs-extra@11.3.0', '@octokit/rest@22.0.0']) {
  try {
    const m = await use(spec)
    const keys = m && (typeof m === 'object' || typeof m === 'function') ? Object.keys(m).slice(0, 12) : []
    console.log(`${spec}: typeof=${typeof m} keys=${JSON.stringify(keys)} typeof default=${typeof m?.default} typeof default.default=${typeof m?.default?.default}`)
  } catch (e) {
    console.log(`${spec}: ERROR ${e.message}`)
  }
}
