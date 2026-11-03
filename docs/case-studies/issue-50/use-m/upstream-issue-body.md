## Summary

Since **use-m 8.16.3** (PR #48, the subpath-exports fix for #47), `use()` returns a different value for packages whose `exports` map has an `import` condition. The common pattern

```js
const { default: yargs } = await use('yargs@17.7.2')
```

now yields `undefined`. Every consumer that loads `https://unpkg.com/use-m/use.js` (unpinned, so it gets `latest`) and uses this pattern broke with no change on its side. Downstream report: link-foundation/gh-pull-all#50. Anyone who installs `gh-pull-all@1.6.0`, which was published 2026-08-17, a month before 8.16.3, now gets this on every run:

```
file:///…/node_modules/gh-pull-all/gh-pull-all.mjs:182
const cli = yargs(yargsInput)
            ^
TypeError: yargs is not a function
```

A second, related break: physical subpaths that are not listed in `exports` (e.g. `use('ink@5.2.1/build/index.js')`) used to work and now throw `Package subpath './build/index.js' is not exported by …/package.json`.

## Reproduction

Save as `repro.mjs` and run `node repro.mjs 8.16.2` / `node repro.mjs 8.16.3` (a copy is in [gh-pull-all `experiments/issue-50-use-m-regression-repro.mjs`](https://github.com/link-foundation/gh-pull-all/blob/issue-50-a950aaf22469/experiments/issue-50-use-m-regression-repro.mjs)):

```js
const version = process.argv[2]
const { use } = eval(await (await fetch(`https://unpkg.com/use-m${version ? '@' + version : ''}/use.js`)).text())

const { default: yargs } = await use('yargs@17.7.2')
console.log('yargs:', typeof yargs)            // 8.16.2: function, 8.16.3+: undefined

await use('ink@5.2.1/build/index.js')            // 8.16.2: ok, 8.16.3+: throws "is not exported"
```

Observed output (Node 26.13.0, Linux):

```
use-m: https://unpkg.com/use-m@8.16.2/use.js
  OK   const { default: yargs } = await use('yargs@17.7.2'); yargs([]) (function)
  OK   use('ink@5.2.1/build/index.js') (function)
use-m: https://unpkg.com/use-m@8.16.3/use.js
  FAIL const { default: yargs } = await use('yargs@17.7.2'); yargs([]): TypeError: yargs is not a function
  FAIL use('ink@5.2.1/build/index.js'): Package subpath './build/index.js' is not exported by '…/ink-v-5.2.1/package.json'.
use-m: https://unpkg.com/use-m@8.16.4/use.js
  (same two failures)
```

A bisect over use-m 8.13.7 … 8.16.4 shows the shape of `await use('yargs@17.7.2')` per version:

| use-m | value returned | `.default` |
|---|---|---|
| ≤ 8.16.1 | `{ default, 'module.exports' }` namespace | yargs function |
| 8.16.2 (#72) | unwrapped callable yargs instance | yargs function |
| **≥ 8.16.3** | **unwrapped ESM default (the function)** | **`undefined`** |

## Root cause

1. `matchPackageExport`/`selectPackageExportTarget` (`src/use/core.js`) now resolve `exports["."]` using the `node`/`import`/`default` conditions. yargs declares `".": [{ "import": "./index.mjs", "require": "./index.cjs" }, "./index.cjs"]`. Before 8.16.3 that array made use-m fall back to `main` (`./index.cjs`, the CJS build). Now it picks `./index.mjs`, whose namespace is only `{ default: Yargs }`.
2. `baseUse` (`src/use/runtime.js`) unwraps any namespace whose only key is `default`:

   ```js
   if (keys.length === 1 && keys[0] === 'default') {
     return module.default;
   }
   ```

   So callers get the bare function. It has no `default` property, so `{ default: yargs }` destructuring yields `undefined`.
3. The exports-map resolution also made unexported physical subpaths an error. That is correct per Node semantics, but it is a breaking change for `use()` callers.

Both changes shipped in a patch release, and consumers load `use-m@latest` from the CDN, so they took effect for everyone at once.

## Workaround (used in gh-pull-all)

Accept every shape and pick the export by type instead of destructuring `default`:

```js
function getDefaultExport(mod, { type, members = [] } = {}) {
  const candidates = [mod, mod?.default, mod?.['module.exports'], mod?.default?.default]
  const ok = c => c != null && (!type || typeof c === type) && members.every(m => typeof c[m] === 'function')
  const found = candidates.find(ok)
  if (!found) throw new TypeError('unexpected module shape')
  return found
}
const yargs = getDefaultExport(await use('yargs@17.7.2'), { type: 'function' })
const fs = getDefaultExport(await use('fs-extra@11.3.0'), { members: ['ensureDir', 'remove'] })
```

Note that the simpler `mod.default || mod` is not enough in general. For example, `simple-git@4` has no default export at all, so use its named `simpleGit` export instead.

Pinning the loader (`https://unpkg.com/use-m@8.16.2/use.js`) also works, but then consumers miss fixes such as subpath exports (#47).

## Suggested fixes in use-m

1. **Keep `.default` working after unwrapping (restores backward compatibility).** In `baseUse`, when returning `module.default` for a single-`default` namespace, and the value is an extensible object or function with no own `default` property, add a non-enumerable self-reference:

   ```js
   const withDefaultAlias = (value) => {
     if ((typeof value === 'function' || (value && typeof value === 'object'))
         && Object.isExtensible(value)
         && !Object.prototype.hasOwnProperty.call(value, 'default')) {
       try {
         Object.defineProperty(value, 'default', { value, enumerable: false, configurable: true, writable: true })
       } catch {}
     }
     return value
   }
   // ...
   if (keys.length === 1 && keys[0] === 'default') {
     return withDefaultAlias(module.default)
   }
   ```

   Then both `const yargs = await use('yargs')` and `const { default: yargs } = await use('yargs')` work for CJS and ESM entries alike. This matches what 8.16.2 effectively returned for yargs (a callable with `.default`).
2. **Fall back to physical subpaths.** When a subpath is not in `exports` but the file exists on disk, warn (`console.warn` once, or a debug flag) and import the file instead of throwing. Throw only when the file does not exist either.
3. **Lock in the shape contract with regression tests.** Assert both access patterns for the packages users commonly load (`yargs`, `yargs/helpers`, `simple-git`, `fs-extra`, `semver`, `@octokit/rest`, `ink`). Treat changes to the returned shape as breaking (a major version bump), because consumers fetch `use-m@latest` at runtime and cannot opt out.

Downstream fix and full case study: link-foundation/gh-pull-all#51 (`docs/case-studies/issue-50/`).
