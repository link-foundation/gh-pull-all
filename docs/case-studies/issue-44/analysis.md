# Issue 44 Case Study: CI/CD False Positives, Warnings, and Errors

Issue: https://github.com/link-foundation/gh-pull-all/issues/44

Pull request: https://github.com/link-foundation/gh-pull-all/pull/45

Primary failing run: https://github.com/link-foundation/gh-pull-all/actions/runs/28360287046

## Data Collected

- GitHub issue metadata and comments: `issue.json`, `issue-comments.json`
- Pull request metadata and all three comment streams: `pr-45.json`, `pr-45-conversation-comments.json`, `pr-45-review-comments.json`, `pr-45-reviews.json`
- Linked CI run metadata and logs: `run-28360287046.json`, `run-28360287046.log`
- Preserved CI-style logs: `ci-logs/`
- Fresh PR run log that exposed skipped tests after a docs/log-only tip commit: `ci-logs/remote-checks-and-release-28362506160.log`
- Template file trees, workflow files, and release/version helpers: `templates/`
- Current repository file tree snapshot: `current-file-tree.txt`

## Requirements From The Issue

1. Download all logs and related issue data into `docs/case-studies/issue-44`.
2. Reconstruct the CI/CD timeline and identify every false positive, warning, and error.
3. Compare the repository with the JavaScript, Rust, Python, and C# AI-driven development pipeline templates.
4. Search online for additional facts and use known components/libraries where appropriate.
5. Find actual root causes, not only symptoms.
6. Add debug output if root cause cannot be established from existing evidence.
7. Report template issues if the same issue exists in templates.
8. Fix all applicable occurrences in this repository.
9. Add a reproducing test before the fix.
10. Keep implementation, tests, and analysis in this pull request.

## Timeline

- 2026-06-28 22:02:12 UTC: Issue 44 was opened with the failing run URL and the request for a case study.
- 2026-06-29 08:54:33 UTC: Run 28360287046 started on `main` at SHA `464b9cc1c16083cfd0e1a2533e449e4298187949`.
- 2026-06-29 08:59:07 UTC: The test job completed successfully.
- 2026-06-29 08:59:15 UTC: The release job reached `Version packages and commit to main`.
- 2026-06-29 08:59:15 UTC: `node scripts/version-and-commit.mjs --mode changeset` failed with `Error: Cannot read properties of null (reading 'trim')`.
- 2026-06-29 09:03:47 UTC: The prepared branch had one earlier successful PR run at SHA `020ccf069e5d115aa602fc7e848169b49b647768`; that did not include the fix.
- 2026-06-29 09:32:55 UTC: PR run 28362506160 started for SHA `7245742a613d9fa81d392445de0769e55cde9677`.
- 2026-06-29 09:33:02 UTC: That PR run compared only `HEAD^2^` to `HEAD^2`, saw the latest docs/log commit, and reported `any-code-changed=false`.
- 2026-06-29 09:33:14 UTC: The PR run completed green with the Test job skipped even though the pull request contained code changes.

Relevant preserved log lines:

- `run-28360287046.log:1056-1064` shows the release step and the exact `trim` error.
- `ci-logs/local-test-version-and-commit-before.log` reproduces the same error locally before the fix.
- `ci-logs/local-node-execfilesync-inherit-return.log` records that `execFileSync(..., { stdio: 'inherit' })` returns `null` in the local Node runtime.
- `ci-logs/remote-checks-and-release-28362506160.log:355-400` shows the skipped-test false positive caused by latest-commit-only PR change detection.

## Online Facts Used

- Node.js `child_process` documentation defines `execFileSync()` as a synchronous child process API and documents `stdio` options: https://nodejs.org/api/child_process.html
- GitHub Actions documents `GITHUB_OUTPUT` as the file-command mechanism for setting step outputs: https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions
- GitHub Actions workflow syntax documents job permissions, timeouts, and trigger behavior used by the release workflow: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- npm trusted publishing documentation explains the OIDC publishing model used by the release workflow: https://docs.npmjs.com/trusted-publishers/

## Root Causes

### Release Failure

`scripts/version-and-commit.mjs` used a shared `run()` wrapper around `execFileSync()` and always returned `execFileSync(...).trim()`.

The wrapper used `stdio: 'inherit'` for non-captured commands. In that mode, Node returns `null` instead of a string. The first non-captured successful command therefore crashed in the wrapper before the version commit could finish. This made the release job fail even though tests had already passed.

The fix is to return `output.trim()` only when `output` is a string and return an empty string for non-captured inherited-stdio commands.

### Line-Limit Warning

Local `npm run check:line-limits` exposed a warning that `gh-pull-all.mjs` was approaching the 1500-line limit. This was not the failing CI error in the linked run, but it was a real CI/CD warning class covered by the issue.

The fix is to extract terminal status display code into `status-display.mjs`, include that file in the published package, and update tests that inspect production source and release packaging.

### PR Test Skipped Despite Code Changes

After the initial fix was pushed, the fresh PR run was green but skipped the Test job. The pull request diff included code changes, but the final commit on the branch only added docs/log artifacts. `scripts/detect-code-changes.mjs` handled GitHub's pull-request merge commit by comparing `HEAD^2^` to `HEAD^2`, which checks only the latest PR head commit.

That behavior created a false positive: CI could report success without running tests for earlier code changes in the same pull request.

The fix is to compare `HEAD^1...HEAD^2` for pull-request merge commits. That matches the full PR base-to-head diff and keeps docs-only PRs fast while still running tests when any code change exists anywhere in the pull request.

## Template Comparison

The repository already follows several template practices:

- A single `release.yml` handles PR checks, push releases, manual releases, and npm trusted publishing.
- Release jobs have explicit permissions and timeouts.
- PR checks validate tests and changesets.
- Publishing has a smoke test after npm publish.

Differences and findings:

- The JavaScript template's `version-and-commit.mjs` uses `zx` command execution and does not contain the `execFileSync(...).trim()` inherited-stdio bug.
- The C# template has a JavaScript `version-and-commit.mjs` plus a focused `version-and-commit.test.mjs`; its command execution does not trim an inherited-stdio `null` value.
- The Rust and Python templates use language-specific release/version helpers, so the JavaScript `execFileSync()` null-return issue does not apply.
- The JavaScript template includes broader workflow reliability tests. This repository already had release workflow tests, and this PR extends them to cover the new published module.
- The current repository's PR change detector had a latest-commit-only edge case. The fix keeps the existing detector design but changes pull-request merge commit handling to the full PR diff range.

No matching template bug was found, so no template issue was opened.

## Solutions Considered

- Replace the command runner with a third-party process library such as `execa`.
- Rewrite the release helper around async child process APIs.
- Keep the existing built-in `execFileSync()` wrapper and handle captured and inherited stdio return values correctly.

The final option is the smallest reliable change. It fixes the proven root cause without changing release sequencing, git behavior, npm publishing behavior, or workflow structure.

## Changes Implemented

- Added `tests/test-version-and-commit.mjs`, which runs `scripts/version-and-commit.mjs` against a local bare Git remote and asserts the version commit output.
- Added the test to `tests/test-all.mjs`.
- Fixed `scripts/version-and-commit.mjs` so non-captured inherited-stdio commands do not call `.trim()` on `null`.
- Extracted status display logic from `gh-pull-all.mjs` into `status-display.mjs`.
- Kept `--version` independent of `status-display.mjs` by dynamically importing status display after early version/help handling.
- Added `status-display.mjs` to `package.json` published files.
- Updated release workflow and progress-bar tests for the extracted module.
- Fixed PR change detection so code changes anywhere in the pull request trigger CI tests, even when the latest commit contains only docs or logs.
- Updated `tests/test-detect-code-changes.mjs` to reproduce that skipped-test false positive.
- Added a patch changeset.
- Preserved CI logs, local reproduction logs, template snapshots, and this case-study analysis.

## Verification

Automated checks:

- `node tests/test-version.mjs` passed after the dynamic import fix.
- `node tests/test-detect-code-changes.mjs` passed in `ci-logs/local-test-detect-code-changes-after-full-pr-diff.log`.
- `npm test` passed: 40/40 tests in `ci-logs/local-npm-test-after-detect-full-pr-diff.log`.
- `npm run check:syntax` passed in `ci-logs/local-check-syntax-after-detect-full-pr-diff.log`.
- `npm run check:line-limits` passed with no warnings in `ci-logs/local-check-line-limits-after-detect-full-pr-diff.log`.
- `npm pack --dry-run` passed and includes `status-display.mjs` in `ci-logs/local-npm-pack-dry-run-final.log`.

The reproducing test failed before the fix with the same error as CI and passed after the fix.

## Residual Risk

The release job itself can only be fully validated on `push` to `main` or a manual release run. The failing helper path is covered locally against a real Git remote, and the PR CI should validate the regular PR checks after this branch is pushed.
