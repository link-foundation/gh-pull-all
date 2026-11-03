---
"gh-pull-all": patch
---

Fix `TypeError: yargs is not a function` on every run. use-m 8.16.3 started returning the yargs function itself instead of a `{ default }` namespace, so `const { default: yargs } = await use(...)` became `undefined`. Modules loaded through use-m are now unwrapped with shape-agnostic helpers (`getDefaultExport`/`getNamedExport`) that work with every use-m release, `simple-git` is loaded through its named `simpleGit` export (compatible with simple-git 3.x and 4.x), `GH_PULL_ALL_USE_M_URL` can pin the use-m source, and `GH_PULL_ALL_DEBUG=1` traces which use-m was loaded and the shape of each module.
