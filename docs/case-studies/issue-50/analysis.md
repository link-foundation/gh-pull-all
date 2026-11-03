# Case study: issue #50 — "gh-pull-all stopped working"

- Issue: https://github.com/link-foundation/gh-pull-all/issues/50 (opened 2026-11-03)
- Fix PR: https://github.com/link-foundation/gh-pull-all/pull/51
- Upstream report: https://github.com/link-foundation/use-m/issues/83

## 1. Symptom

From the issue screenshot (`screenshot.png`), after `bun i -g gh-pull-all@latest` installs 1.6.0:

```
$ gh-pull-all --org tophunter-ai
file:///Users/konard/.bun/install/global/node_modules/gh-pull-all/gh-pull-all.mjs:182
const cli = yargs(yargsInput)
            ^
TypeError: yargs is not a function
Node.js v20.19.4
```

Every invocation crashes before any argument is parsed, including `--help`. The tool is completely unusable.

## 2. Requirements from the issue

| # | Requirement | Where it is addressed |
|---|---|---|
| R1 | Make gh-pull-all work again (workaround in this repo) | `load-use-m.mjs` (`getDefaultExport` / `getNamedExport`), `gh-pull-all.mjs`, `version.mjs` |
| R2 | If caused by use-m, fix the regression there so backward compatibility is not broken | Root cause in use-m 8.16.3 confirmed; reported with a tested code fix in link-foundation/use-m#83 (§6) |
| R3 | Download all logs and data to `docs/case-studies/issue-50` | This folder (§9) |
| R4 | Reconstruct the timeline | §3 |
| R5 | List each and every requirement | This table |
| R6 | Find the root cause of each problem | §4 |
| R7 | Propose solutions and solution plans for each requirement | §5, §6 |
| R8 | Search online for additional facts | §7 |
| R9 | Check existing components/libraries that solve similar problems | §7 |
| R10 | If data is insufficient, add debug output / verbose mode | `GH_PULL_ALL_DEBUG=1`, `GH_PULL_ALL_USE_M_URL` (§5.3) |
| R11 | Report issues to other repositories, each with reproducible examples, workarounds and code-fix suggestions | link-foundation/use-m#83; other candidates checked in §6 |
| R12 | Apply the fix to the entire codebase | All `use()` call sites in the CLI, `version.mjs`, tests and demos; static guard test (§5.2) |

## 3. Timeline

All times are UTC unless noted. Sources: `use-m/npm-publish-times-8.x.txt`, `use-m/tag-dates.txt`, `use-m/use-m-pr-48.json`, `evidence/simple-git-publish-times.txt`, `issue.json`, and `npm view gh-pull-all time`.

| Date | Event |
|---|---|
| 2026-07-03 | gh-pull-all 1.5.0 published |
| 2026-08-11 | use-m #72 (unwrap callable CommonJS defaults on Node 24) closed |
| 2026-08-17 | **gh-pull-all 1.6.0 published**. It loads `https://unpkg.com/use-m/use.js` (always `latest`) and uses `const { default: yargs } = await use('yargs@17.7.2')`. Works. |
| 2026-09-21 08:55 | use-m 8.16.1 published. Works. |
| 2026-09-21 19:45 | use-m 8.16.2 published. Shape of `use('yargs')` changes to an unwrapped callable that **still has `.default`**. Still works. |
| 2026-09-22 03:24 | use-m PR #48 "Resolve package subpath exports for npm and Bun" (fixes use-m #47 "Cannot import sub-paths like 'yargs/helpers'") merged |
| 2026-09-22 03:28 | **use-m 8.16.3 published**. `use('yargs@17.7.2')` now returns the bare ESM default function with no `.default`. gh-pull-all 1.6.0 starts crashing for everyone, with no change in gh-pull-all. |
| 2026-09-24 20:13 | use-m 8.16.4 published (same behavior) |
| 2026-09-25 10:38 | simple-git 4.0.0 published. Its default export is removed, so `simple-git@latest` breaks `{ default: simpleGit }` and `mod.default` in the test suite. |
| 2026-11-03 07:09 | Issue #50 reported |
| 2026-11-03 | Root cause bisected; fix, tests and case study in PR #51; upstream issue use-m#83 filed |

## 4. Root causes

### 4.1 `yargs is not a function` (the reported crash)

Evidence: `evidence/use-m-version-bisect-yargs-shape.txt`, `evidence/matrix-before-fix.log`, `evidence/use-m-regression-repro.txt`, `use-m/src-use.mjs-v8.16.2-to-v8.16.3.diff`.

The bisect gives the shape of `await use('yargs@17.7.2')` per use-m version:

| use-m | returned value | `.default` | `{ default: yargs }` |
|---|---|---|---|
| 8.13.7 – 8.16.1 | `{ default, 'module.exports' }` namespace | function | works |
| 8.16.2 | unwrapped callable yargs instance | function | works |
| 8.16.3, 8.16.4 | unwrapped ESM default function | `undefined` | **`undefined` → crash** |

Two use-m changes combine to cause this:

1. **Exports-map resolution (use-m PR #48).** `selectPackageExportTarget` in `src/use/core.js` resolves `exports["."]` with the `node`/`import`/`default` conditions. yargs declares `".": [{ "import": "./index.mjs", "require": "./index.cjs" }, "./index.cjs"]`. Older versions fell back to `main` (`index.cjs`); 8.16.3 picks the ESM `index.mjs`, whose namespace is just `{ default: Yargs }`.
2. **Default unwrapping in `baseUse`** (`src/use/runtime.js`):

   ```js
   if (keys.length === 1 && keys[0] === 'default') {
     return module.default;
   }
   ```

   A namespace with only `default` is replaced by its value, so callers receive the bare function, which has no `default` property.

gh-pull-all had pinned `yargs@17.7.2` but not use-m: `load-use-m.mjs` fetches `https://unpkg.com/use-m/use.js`. A patch release of use-m therefore changed the runtime behavior of an already-published gh-pull-all. This also explains why the reporter saw the crash on 1.6.0, a version that had worked when it was published.

The matrix run (`experiments/issue-50-use-m-version-matrix.sh`) of the unchanged CLI gives 8.13.7 / 8.16.1 / 8.16.2 OK and 8.16.3 / 8.16.4 / latest **FAIL: TypeError: yargs is not a function**.

### 4.2 Same pattern elsewhere in the codebase

Other call sites relied on the same fragile `{ default: X } = await use(...)` destructuring:

- `simple-git` (CLI and five test files)
- `fs-extra` (CLI)
- `semver` (`version.mjs`, used by the release script)
- `react` / `ink` (demo)

Under 8.16.3+ they happened to keep working only because those packages' namespaces have more than one key. Any further change in use-m's unwrapping, or in the packages' export maps, would break them the same way.

### 4.3 simple-git 4 removed its default export

`tests/test-file-operations.mjs` loads `simple-git@latest`. simple-git 4.0.0 (2026-09-25) no longer has a default export, so `mod.default` is `undefined` and one test failed on `main` too (`evidence/test-file-operations-before-fix.log`: 5/6 passed). The named `simpleGit` export exists in 3.x and 4.x.

### 4.4 Demo: unexported subpath and duplicate React

`demos/ink-list-demo.mjs` imported `ink@latest/build/index.js`. use-m 8.16.3 enforces `exports`, so this throws `Package subpath './build/index.js' is not exported`. Independently, and already on use-m 8.16.2 (`evidence/ink-demo-before-fix-use-m-8.16.2.log`), the demo loaded `react@latest` as a separate alias install. That gave two React copies (ink's own `react` dependency and the alias), which caused `Invalid hook call`.

## 5. Solution implemented in this repository

### 5.1 Shape-tolerant export lookup (`load-use-m.mjs`)

- `getDefaultExport(mod, { name, type, members })` checks `mod`, `mod.default`, `mod['module.exports']` and `mod.default.default`. It returns the first candidate whose `typeof` matches `type` and which has every function in `members`.
- `getNamedExport(mod, exportName, { name, type, optional })` looks for `candidate[exportName]` in the same candidates.
- When no candidate matches, both helpers throw a `TypeError` naming the package, the expected and actual shape, where to report, and how to get a trace. The user sees a diagnosable message instead of `X is not a function` deep in the code.

Call sites:

```js
const yargs = getDefaultExport(await use('yargs@17.7.2'), { name: 'yargs', type: 'function' })
const hideBin = getNamedExport(await use('yargs@17.7.2/helpers'), 'hideBin', { name: 'yargs/helpers', type: 'function', optional: true }) || ((argv) => argv.slice(2))
const Octokit = getNamedExport(await use('@octokit/rest@22.0.0'), 'Octokit', { name: '@octokit/rest', type: 'function' })
const git = getNamedExport(await use('simple-git@3.28.0'), 'simpleGit', { name: 'simple-git', type: 'function' })
const fs = getDefaultExport(await use('fs-extra@11.3.0'), { name: 'fs-extra', members: ['ensureDir', 'remove'] })
```

The fix keeps `use-m@latest` (so gh-pull-all still gets use-m fixes) and works with every use-m version tested: 8.13.7, 8.16.1, 8.16.2, 8.16.3, 8.16.4 and latest (`evidence/matrix-after-fix.log`). It also works under Bun (`evidence/bun-after-fix.log`).

### 5.2 Applied to the entire codebase

- `gh-pull-all.mjs`: yargs, yargs/helpers, @octokit/rest, simple-git, fs-extra.
- `version.mjs`: semver.
- `tests/test-auto-detect.mjs`, `test-file-operations.mjs`, `test-merge-result.mjs`, `test-single-repo.mjs`, `test-switch-to-default.mjs`: simple-git via the named `simpleGit` export (fixes §4.3).
- `demos/ink-list-demo.mjs`: imports the `ink` root, with the old subpath as a fallback; takes React from ink's own install so there is a single copy (fixes §4.4).
- `tests/test-use-m-module-shapes.mjs` has a static guard that fails if any `.mjs` file in the root, `tests/`, `scripts/` or `demos/` destructures `{ default: X } = await use(` again.

### 5.3 Debug / verbose mode (R10)

- `GH_PULL_ALL_DEBUG=1` (or `DEBUG=gh-pull-all`) writes `[gh-pull-all:use-m] …` lines to stderr. They show which use-m URL was loaded and, for every package, the shape `use()` returned and which candidate was picked, e.g. `yargs: use() returned function(keys: none) -> default export -> function`. Off by default.
- `GH_PULL_ALL_USE_M_URL=<url>[,<url>…]` overrides the use-m source list. Use it to pin a known-good version (`https://unpkg.com/use-m@8.16.2/use.js`) or to bisect a future regression without editing code.

### 5.4 Tests

- `tests/test-use-m-module-shapes.mjs` (new, 17 tests). It covers every yargs shape observed per use-m version, proves that the old destructuring yields `undefined` on the ≥ 8.16.3 shape, and covers simple-git 3.x/4.x, fs-extra/semver member checks, error messages, the `hideBin`/`Octokit` named lookups, env-var parsing, the debug toggles and the static guard. It also includes an end-to-end run of the real CLI with the real use-m that must get past argument parsing.
- `tests/test-concurrent-processing.mjs`: the "valid user" test killed the CLI after a fixed 3 s and was flaky when unpkg/npm was slow. It now waits (bounded at 30 s) until the initialization output appears.
- The first local full-suite run passed 41/42 (`evidence/full-suite-before-flaky-test-fix.log`). Its only failure was that 3 s timing race. After the test was fixed, the full suite passes (`evidence/full-suite-after-fix.log`).
- README gained a "Troubleshooting" section documenting `GH_PULL_ALL_DEBUG` and `GH_PULL_ALL_USE_M_URL`.

## 6. Fix in use-m and reports to other repositories (R2, R11)

Filed **link-foundation/use-m#83** (body in `use-m/upstream-issue-body.md`). It contains:

- a minimal reproduction (`experiments/issue-50-use-m-regression-repro.mjs`, output in `evidence/use-m-regression-repro.txt`);
- the bisect table and root-cause code references;
- the workaround above;
- suggested code fixes:
  1. When `baseUse` unwraps a single-`default` namespace into an extensible value with no own `default`, add a **non-enumerable `default` self-reference**. Then both `await use('yargs')` and `{ default: yargs } = await use('yargs')` work, as in 8.16.2. Verified against the real 8.16.4 output: `typeof y === 'function'`, `typeof y.default === 'function'`, `Object.keys(y)` stays `[]`, and `yargs(['--a','1']).parse().a === 1`.
  2. Fall back, with a warning, to physical subpaths that exist on disk but are not listed in `exports`.
  3. Add shape-contract regression tests, and treat shape changes as breaking, because consumers fetch `use-m@latest` at runtime.

Other repositories checked:

- `konard/kaiten-api-tools` (`download-card.mjs`) uses `yargsModule.default || yargsModule`, which works on every use-m version.
- `konard/trello-api-tools` gets yargs through `lino-arguments`.
- `link-assistant/hive-mind` already forbids direct `use('yargs…')` in a test (`DISALLOWED_DIRECT_YARGS_PATTERNS`).

None of them is affected, so no further issues were filed. The single upstream root cause is tracked in use-m#83.

## 7. Online research and prior art (R8, R9)

- **Node.js conditional exports / dual packages.** When a package ships `import` and `require` entries, which one a loader picks changes what the namespace looks like. For a CJS entry imported from ESM, the namespace is `{ default: module.exports, …named }`. For an ESM entry with only `export default`, it is just `{ default }`. The Node docs and https://github.com/nodejs/package-examples describe this "dual package" behavior and hazard. It is exactly the difference between use-m ≤ 8.16.2 (CJS `index.cjs`) and ≥ 8.16.3 (ESM `index.mjs`) for yargs.
- **yargs.** The canonical ESM usage is `import yargs from 'yargs'; import { hideBin } from 'yargs/helpers'`, then calling `yargs(hideBin(process.argv))` (yargs/yargs#1754, #1844). `yargs is not a function` / `y18n is not a function` errors in the wild come from tools that load the CJS and ESM halves inconsistently (e.g. webpack, yargs/yargs#1754). That is the same class of problem.
- **Earlier use-m regressions.** link-foundation/use-m#60 ("After latest release multiple projects which used use-m failed", a CDN 404 during bootstrap) and #72 (callable CJS unwrapping on Node 24) show the recurring risk of loading an unpinned `use-m@latest`. use-m#15 ("It may be a good idea to return `.default` by default") is the open design discussion behind the unwrapping behavior.
- **hive-mind prior art.** `link-assistant/hive-mind` `docs/dependencies-research/use-m-issues/README.md` recommends `mod.default || mod`. That handles yargs, but not packages without a default (simple-git 4) or namespaces whose `default` is not the API. gh-pull-all's helpers generalize it with type and member checks plus a clear error.
- **Alternatives considered:**
  - Declare dependencies in `package.json` and use static `import`. This is the most robust option, but it changes the project's zero-install design and the `bun i -g` story.
  - Pin use-m (`use-m@8.16.2`). This is immediate, but freezes out use-m fixes (e.g. #47 subpath exports) and needs manual bumps.
  - Shape-tolerant lookup (chosen). It keeps the design, works with all known use-m versions, fails loudly with diagnostics, and `GH_PULL_ALL_USE_M_URL` still allows pinning when needed.

## 8. How to reproduce and verify

```bash
# Before the fix (gh-pull-all 1.6.0, any use-m >= 8.16.3):
bun i -g gh-pull-all@1.6.0 && gh-pull-all --help   # TypeError: yargs is not a function

# Upstream-only reproduction:
node experiments/issue-50-use-m-regression-repro.mjs 8.16.2   # OK
node experiments/issue-50-use-m-regression-repro.mjs 8.16.3   # FAIL

# After the fix, across use-m versions:
bash experiments/issue-50-use-m-version-matrix.sh
node tests/test-use-m-module-shapes.mjs
GH_PULL_ALL_DEBUG=1 node gh-pull-all.mjs --help
```

## 9. Files in this folder

- `screenshot.png`, `issue.json`, `issue-comments.json`: original report.
- `pr-51*.json`: PR metadata and comments at the time of the analysis.
- `use-m/`: npm publish times, tag dates, the `v8.16.2..v8.16.3` source diff, changelog head, use-m PR #48 and issues #47/#60/#72, and the upstream issue body (#83).
- `evidence/use-m-version-bisect-yargs-shape.txt`, `evidence/use-m-latest-module-shapes.txt`: module shapes per use-m version.
- `evidence/matrix-before-fix.log`, `evidence/matrix-after-fix.log`: the real CLI across use-m versions.
- `evidence/use-m-regression-repro.txt`: upstream reproduction output.
- `evidence/test-*-before-fix.log`, `evidence/test-*-after-fix.log`, `evidence/full-suite-before-flaky-test-fix.log`, `evidence/full-suite-after-fix.log`: test evidence.
- `evidence/bun-after-fix.log`: Bun run.
- `evidence/ink-demo-*.log`: demo before/after.
- `evidence/simple-git-publish-times.txt`: simple-git 4.0.0 release date.
