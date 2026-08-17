# Issue 48 Case Study: Fetch And Pull In All Active Git Worktrees

Issue: https://github.com/link-foundation/gh-pull-all/issues/48

Pull request: https://github.com/link-foundation/gh-pull-all/pull/49

## Data Collected

- Issue and PR metadata: `issue.json`, `issue-comments.json` (empty), `pr-49.json`, `pr-49-conversation-comments.json` (empty), `pr-49-review-comments.json` (empty), `pr-49-reviews.json` (empty)
- Current repository file tree snapshot: `current-file-tree.txt`
- Recent merged PR context: `recent-merged-prs.json`
- Local before/after verification logs: `local-issue-48-reproduction-before-fix.txt`, `local-issue-48-reproduction-after-fix.txt`

The issue has no comments, so the requirement list below is derived directly from the issue body.

## Requirements From The Issue

1. Fully support multiple git worktrees.
2. Make sure `fetch + pull` happens in **all** active worktrees, not only the default repository folder.
3. Double check all related places in the codebase: every check that protects data that may be lost must also inspect all git worktrees.
4. Collect issue-related data into `docs/case-studies/issue-48` and use it for the case study analysis.
5. Search online for additional facts and data.
6. List each requirement and propose possible solutions and solution plans for each.
7. Check known existing components and libraries that solve similar problems.
8. Plan and execute everything in a single pull request until every requirement is addressed.

## Root Causes

Before this change `gh-pull-all` had exactly one notion of a repository: the directory `<target-dir>/<repo-name>`.

- `pullRepository()` created `simple-git` at that path and ran `fetch`/`pull` there. `git pull` only ever updates the working tree and branch of the worktree it runs in, so branches checked out in linked worktrees stayed behind even though the objects were fetched into the shared object database.
- `switchToDefaultBranch()` ran `git checkout <default>` in the main worktree. Git refuses to check out a branch that another worktree already holds (`fatal: '<branch>' is already used by worktree at '<path>'`), so the operation failed whenever a linked worktree held the default branch.
- `syncForkWithUpstream()` checked out the upstream default branch in the main worktree, hitting the same restriction.
- The uncommitted-changes guards (`pullRepository`, `switchToDefaultBranch`, `deleteRepository`, `syncForkWithUpstream`) all called `git status` in the main worktree only. `git status` is per worktree, so uncommitted work living in a linked worktree was invisible.
- `deleteRepository()` removed `<target-dir>/<repo-name>` with `fs.remove`. That directory holds the object database and `.git/worktrees/*` administrative files shared by every linked worktree, so deleting it destroyed uncommitted work in linked worktrees and broke all of them, even when they lived elsewhere on disk.

Reproduction (`experiments/issue-48-worktree-pull-reproduction.mjs`) builds a local bare remote with `main` and `feature`, clones it through `gh-pull-all`, attaches a linked worktree for `feature`, pushes new commits to both branches, and re-runs the tool:

```
main worktree pulled: true
linked worktree pulled: false
🐛 Reproduced issue #48: linked worktrees are never fetched or pulled
```

(`local-issue-48-reproduction-before-fix.txt`)

## Online Facts Used

- `git worktree list --porcelain` is the only stable, script-friendly interface listing every worktree attached to a repository. Each record is a block of `label value` lines separated by blank lines, with keys `worktree`, `HEAD`, `branch refs/heads/<name>`, and the boolean-or-reason flags `bare`, `detached`, `locked`, `prunable`. The format is guaranteed stable across Git versions and user configuration — https://git-scm.com/docs/git-worktree
- Git refuses `git worktree add` (and `git checkout`) for a branch that is already checked out in another worktree unless `--force` is used. This is the reason the default-branch and fork-sync flows must run inside the worktree that owns the branch — https://git-scm.com/docs/git-worktree
- Deleting a worktree directory without `git worktree remove` leaves stale administrative files in `$GIT_DIR/worktrees` until `git worktree prune` (or `gc.worktreePruneExpire`) cleans them, which is why `--delete` must refuse to remove a repository whose linked worktrees live outside it — https://git-scm.com/docs/git-worktree

### Existing Components And Libraries Considered

| Option | Verdict |
| --- | --- |
| `simple-git` (already a dependency) `raw(['worktree', 'list', '--porcelain'])` | **Chosen.** No new dependency; the porcelain format is documented as stable, and `simple-git` instances are already created per path in this codebase (`createGit(repoPath)`), so pointing one at a worktree path needs no new machinery. |
| Dedicated npm worktree parsers (e.g. small `git-worktree` wrappers) | Rejected: unmaintained or thin wrappers around the same command, adding supply-chain surface for ~60 lines of parsing. |
| [`myrepos` (`mr`)](https://myrepos.branchable.com/) | Multi-repo updater with `mr -j5 update`; solves the multi-repository problem, not the multi-worktree problem, and is an external Perl tool. |
| [`gita`](https://github.com/nosarthur/gita) | Manages many repos and supports custom worktrees for bare repos, but does not iterate all linked worktrees of a normal clone; Python, out of process. |
| [`GongSakura/worktree`](https://github.com/GongSakura/worktree) | Creates and manages worktrees for multiple repositories, i.e. a worktree *creation* workflow rather than an update-everything sweep. |
| `git fetch --all` alone | Insufficient by design: fetching updates the shared object database, but each worktree's branch and working tree still need its own `pull`. |

## Requirements, Solutions Considered, And Plans

### 1–2. Fetch and pull in all active worktrees

Options considered:

- **A. Iterate worktrees with a per-worktree `simple-git` instance** (chosen). Pull the main worktree exactly as before, then pull each linked worktree on its own branch.
- B. Run `git fetch --all` once and `git merge --ff-only` per worktree. Rejected: it silently diverges from the existing `pull` semantics (rebase/merge config, upstream tracking) that users already rely on.
- C. Ask users to list worktrees manually via configuration. Rejected: the issue asks for automatic full support.

Plan: add `git-worktrees.mjs` with `parseWorktreeList`/`listLinkedWorktrees`/`pullWorktree(s)`, call it from `pullRepository`, and aggregate the outcome into one status line per repository.

### 3. Every data-loss check must consider all worktrees

Options considered:

- **A. Check `git status` in each worktree and skip per worktree** (chosen for pull), plus **repository-level refusal for destructive operations** (chosen for `--delete`).
- B. Abort the whole repository whenever any worktree is dirty. Rejected for pull: it would stop updating clean worktrees for no safety benefit.
- C. Force-clean dirty worktrees. Rejected: it destroys exactly the data the issue asks to protect.

Plan:
- Pull: skip individual worktrees that are dirty, detached, have no upstream, or are missing on disk; report the counts.
- `--delete`: skip the repository when any worktree (main or linked) is dirty, and skip when linked worktrees live outside the repository directory, because removing the object database would break them.
- `--switch-to-default`: when the default branch is held by a linked worktree, pull it there instead of failing the checkout.
- `--pull-changes-to-fork`: run the upstream sync inside the worktree that holds the upstream default branch, verify that worktree is clean, then pull the remaining worktrees.

### 4–5. Case study data and online research

Collected with `gh` into `docs/case-studies/issue-48` (this document plus the JSON/logs listed above), and the git documentation facts above.

### 6–7. Requirements list, solution plans, existing components

This document; the comparison table above.

### 8. Single pull request

All implementation, tests, docs, changeset, experiment, and this analysis are in PR #49.

## Changes Implemented

- `git-worktrees.mjs` (new): porcelain parsing, worktree listing/filtering, per-worktree status and dirty detection, upstream detection, per-worktree pull with skip reasons, and status aggregation.
- `gh-pull-all.mjs`:
  - new `--worktrees` boolean option (default `true`, opt out with `--no-worktrees`);
  - `pullRepository` split into `pullDefaultIntoCurrentBranch`, `pullMainWorktree`, `reportResult`, then pulls linked worktrees and reports `Successfully pulled X of N worktrees(...)`;
  - `switchToDefaultBranch` detects a default branch held by a linked worktree and pulls it there, then pulls the remaining worktrees;
  - `deleteRepository` refuses to delete when any worktree is dirty or when linked worktrees live outside the repository directory;
  - the flag is threaded through `processRepository` and `main`.
- `fork-sync.mjs`: the upstream sync runs in the worktree holding the upstream default branch (with its own dirty check) and the remaining worktrees are pulled afterwards.
- `tests/test-worktrees.mjs` (new), `tests/common-test-utils.mjs` (shared local-remote and fake `gh` fixtures), `tests/test-all.mjs` (registration).
- `tests/test-release-workflow.mjs`: stopped asserting the presence of `.changeset/default-auto-mode.md`, which release `1.5.0` consumed — this assertion fails on `main` today, independently of this change.
- Docs: `README.md` (feature bullet, options, example, “Git Worktrees” section), `help-text.mjs`.
- `package.json`: `git-worktrees.mjs` added to the published `files`.
- `.changeset/worktree-aware-fetch-and-pull.md`: minor release.

Status messages keep the substrings that `status-display.mjs#printSummary` matches (`pulled`, `Switched from`, `Already on default branch`, `synced fork with upstream`, `up to date with upstream`), so summary counters keep working.

## Verification

- `experiments/issue-48-worktree-pull-reproduction.mjs` after the fix: `main worktree pulled: true`, `linked worktree pulled: true` (`local-issue-48-reproduction-after-fix.txt`).
- `tests/test-worktrees.mjs` covers: porcelain parsing (main/linked/detached/prunable/bare, branch lookup, path containment, summary counting), linked worktrees being pulled, `--no-worktrees` opting out, dirty linked worktrees being skipped with their files intact, `--delete` refusing to remove a repository whose worktree is dirty, `--delete` skipping repositories with worktrees stored outside, and `--switch-to-default` pulling the default branch inside the worktree that holds it.
- Full suite: `npm test`, plus `npm run check:syntax`, `npm run check:line-limits`, `npm run check:changeset`.

## Residual Risk

- Locked worktrees are pulled like any other worktree; `locked` protects against pruning, not against updates. A lock reason is parsed and available if a stricter policy is wanted later.
- Worktrees are pulled sequentially per repository. Repository-level concurrency (`--threads`) is unchanged, so a repository with very many worktrees takes proportionally longer.
- Worktrees on network shares or removable media that are unmounted are reported as missing and skipped rather than failing the repository.
- `--delete` intentionally leaves repositories with external worktrees in place; users who want them gone must remove the worktrees (`git worktree remove`) first.
