# Issue 38 Case Study: Empty Repository Pulls

## Timeline

- 2026-06-25 10:01:46 UTC: Issue #38 was opened with the empty-repository pull failure.
- 2026-06-25 10:02:35 UTC: PR #39 was created from `issue-38-cd02a821e0d3`.
- Investigation downloaded the issue, PR, issue comments, PR comments, PR review comments, and PR reviews into this folder. There were no issue or PR comments at investigation time.
- A local reproduction in `empty-remote-reproduction.log` confirmed that cloning an empty remote leaves `branch.main.merge=refs/heads/main`, while a later `git pull` fails because no such ref was fetched.

## Requirements

- Existing clones of empty repositories must not be reported as failures on later syncs.
- The user-facing result should read as a successful pull or no-op, not as a high-attention error.
- The sync must still fetch first, so a repository that was empty before can pick up a newly-created default branch.
- If a default branch appears later, the local clone should switch to it and pull it.
- Investigation data and analysis must be kept under `docs/case-studies/issue-38`.
- The fix needs an automated regression test.

## External Facts

- Git documents `git pull` as fetch plus integration into the current branch; with no arguments, the branch to integrate comes from the configured upstream. Source: https://git-scm.com/docs/git-pull
- Git documents `branch.<name>.merge` and `branch.<name>.remote` as the upstream configuration used by `git fetch`, `git pull`, and related commands. Source: https://git-scm.com/docs/git-config
- Git documents `git remote set-head --auto` as querying the remote HEAD and updating `refs/remotes/<name>/HEAD` after the branch has been fetched. Source: https://git-scm.com/docs/git-remote
- Git documents `git symbolic-ref --short HEAD` as a way to read the current branch name from the symbolic HEAD, which also works for unborn branches. Source: https://git-scm.com/docs/git-symbolic-ref

## Root Causes

- Empty clones can have an unborn local branch configured to merge a remote branch that does not exist yet. A later plain `git pull` asks Git to merge that missing upstream and Git reports: `Your configuration specifies to merge with the ref 'refs/heads/main' from the remote, but no such ref was fetched.`
- `directoryExists()` used `fs.stat` from the dynamically loaded `fs-extra` object, but that import did not expose `stat` in this environment. That made existing repository directories look absent under Node and could force clone attempts over existing directories.
- `git rev-parse --abbrev-ref HEAD` can fail on unborn branches. The code needed a symbolic-ref fallback before it could switch an empty clone when a first default branch appeared.

## Solution

- Use Node `fs/promises.stat` for `directoryExists()` so existing repository directories are detected reliably.
- After fetching an existing repo, check whether local `HEAD` points to a commit.
- If the repo has no local commits and no remote branches, mark the operation as `Successfully pulled (empty repository)`.
- If the repo has no local commits and remote branches now exist, detect the default branch, switch/create the local branch from `origin/<default>`, pull it, and report `Successfully pulled <branch>`.
- Read current branch names through a helper that falls back from `rev-parse --abbrev-ref HEAD` to `symbolic-ref --short HEAD`.

## Verification

- `tests/test-empty-repository.mjs` reproduces the issue through the real CLI with a fake `gh` command and local bare remotes.
- The test covers a still-empty remote, a remote where the configured default branch appears later, and a remote where a different default branch appears later.
- `test-empty-repository-before.log` contains the pre-fix failure.
- `test-empty-repository-after.log` contains the passing post-fix targeted regression run.
- `npm-test.log` contains the full-suite run on this branch: 20/29 suites passed, including the new empty-repository regression. The remaining failures overlap with the saved baseline and include Bun/runtime/network-sensitive suites and terminal-output expectation failures.
- `npm-test-baseline-origin-main.log` contains the same full-suite run on `origin/main`: 18/28 suites passed, confirming the broad full-suite failures are not introduced by this PR.
