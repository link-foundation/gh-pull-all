# Issue 46 Case Study: CI/CD False Positives, Warnings, and Errors

Issue: https://github.com/link-foundation/gh-pull-all/issues/46

Pull request: https://github.com/link-foundation/gh-pull-all/pull/47

Primary run from issue: https://github.com/link-foundation/gh-pull-all/actions/runs/28363495995

## Data Collected

- Issue and PR metadata: `issue.json`, `issue-comments.json`, `pr-47.json`, `pr-47-conversation-comments.json`, `pr-47-review-comments.json`, `pr-47-reviews.json`
- Linked CI metadata and logs: `run-28363495995.json`, `run-28363495995.log`
- Local before/after verification logs: `local-*.log`
- Current repository file tree snapshot: `current-file-tree.txt`
- Recent merged PR context: `recent-merged-prs.json`
- Latest template metadata, full file trees, CI file lists, and release workflows: `templates/`
- Template issue body and created issue URLs: `template-*-issue-url.txt`

## Requirements From The Issue

1. Download logs and issue data into `docs/case-studies/issue-46`.
2. Reconstruct the CI/CD timeline and identify false positives, warnings, and errors.
3. Compare the repository with the JavaScript, Rust, Python, and C# pipeline templates.
4. Search online for supporting facts and existing approaches.
5. Find root causes before fixing.
6. Add debug output or deterministic evidence if the existing logs are insufficient.
7. Report matching issues in the template repositories.
8. Fix all applicable occurrences in this repository.
9. Add reproducing tests before the fix.
10. Keep implementation, tests, and analysis in this pull request.

## Timeline

- 2026-06-29 09:50:43 UTC: Linked run `28363495995` started on `main`.
- 2026-06-29 09:50:45 UTC: `Detect Changes` checkout emitted Git's default-branch hint during `git init`.
- 2026-06-29 09:50:51 UTC: `Test` checkout emitted the same Git default-branch hint.
- 2026-06-29 09:57:09 UTC: `test-uncommitted-changes.mjs` started.
- 2026-06-29 09:57:26 UTC: `test-uncommitted-changes.mjs` failed with `Expected uncommitted changes status icon not found`.
- 2026-06-29 09:57:28 UTC: `npm run test:ci` reported `Failed: 1/40 tests`.
- 2026-07-02 06:57:51 UTC: Issue 46 was opened with the failing run URL and the template comparison requirement.
- 2026-07-02 21:40:26 UTC: Prepared PR branch run `28623321155` passed on the placeholder commit; that run did not exercise this fix.

Relevant log locations:

- `run-28363495995.log` lines around the checkout phases show the Git default-branch hints.
- `run-28363495995.log` lines around the `Uncommitted Changes` suite show the failed assertion.
- `local-test-release-workflow-before-git-env.log` shows the new workflow contract failing before `release.yml` was updated.
- `local-experiment-git-init-default-branch-env.log` demonstrates the Git runtime env workaround.

## Online Facts Used

- Git documents `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, and `GIT_CONFIG_VALUE_<n>` as environment-provided runtime config pairs: https://git-scm.com/docs/git-config
- GitHub Actions documents workflow syntax and top-level/job/step environment variables: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- GitHub Actions variables documentation confirms custom environment variables can be set for a workflow: https://docs.github.com/actions/learn-github-actions/variables

## Root Causes

### Git Default-Branch Warning During Checkout

`actions/checkout@v6` runs `git init` before repository steps execute. On runners where Git emits the Git 3.0 default-branch hint, a normal step such as `git config --global init.defaultBranch main` would run too late.

The fix is to set Git's runtime config at workflow scope:

```yaml
env:
  GIT_CONFIG_COUNT: '1'
  GIT_CONFIG_KEY_0: init.defaultBranch
  GIT_CONFIG_VALUE_0: main
```

The local experiment proves this exposes `init.defaultBranch=main` to Git and suppresses the hint.

### Live GitHub Dependency In `test-uncommitted-changes.mjs`

The failed test cloned live repositories from the `deep-assistant` organization, modified whichever repositories appeared first in the local directory, then called the live GitHub API again and asserted on terminal output.

That made CI depend on external repository state, network timing, API ordering, and the current output shape of live repositories. The linked log captured the failed assertion, but the test did not print the second CLI command's full output before failing, so the exact external condition cannot be fully reconstructed.

The fix is to replace the live GitHub dependency with a local fake `gh` executable and three local bare repositories. The test now exercises the real `gh-pull-all.mjs` CLI, clone path, pull path, uncommitted-change detection, and summary output without depending on GitHub's live repository list.

The rewritten assertions include bounded diagnostic output when they fail, so a future failure will preserve the relevant CLI output.

## Template Comparison

Fresh snapshots were downloaded for:

- `link-foundation/js-ai-driven-development-pipeline-template`
- `link-foundation/rust-ai-driven-development-pipeline-template`
- `link-foundation/python-ai-driven-development-pipeline-template`
- `link-foundation/csharp-ai-driven-development-pipeline-template`

All four templates use `actions/checkout@v6` in their release workflow. None had a workflow-level `GIT_CONFIG_*` env block for `init.defaultBranch`.

Created matching template issues:

- JavaScript template: https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/99
- Rust template: https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/89
- Python template: https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/28
- C# template: https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template/issues/35

The live `deep-assistant` uncommitted-changes test is specific to this repository. No equivalent template test issue was found.

## Changes Implemented

- Added workflow-level Git runtime config to `.github/workflows/release.yml`.
- Extended `tests/test-release-workflow.mjs` to assert the Git config env remains present.
- Replaced `tests/test-uncommitted-changes.mjs` with a deterministic local fake-`gh` fixture.
- Added `experiments/git-init-default-branch-env.mjs` for repeatable validation of the checkout-warning workaround.
- Added `.changeset/stabilize-ci-warning-tests.md`.
- Preserved issue data, CI logs, template snapshots, template issue URLs, local reproductions, and this analysis.

## Verification

Before-fix evidence:

- `local-test-release-workflow-before-git-env.log` failed because `release.yml` did not set the Git runtime config.
- `run-28363495995.log` contains the historical `test-uncommitted-changes.mjs` failure.

After-fix checks:

- `node experiments/git-init-default-branch-env.mjs` passed in `local-experiment-git-init-default-branch-env.log`.
- `node tests/test-release-workflow.mjs` passed in `local-test-release-workflow-final.log`.
- `node tests/test-uncommitted-changes.mjs` passed in `local-test-uncommitted-final.log`.
- `npm run check:syntax` passed in `local-check-syntax.log`.
- `npm run check:line-limits` passed in `local-check-line-limits.log`.
- `npm run check:changeset` passed after the implementation commit; it detected `.changeset/stabilize-ci-warning-tests.md` as the required patch changeset.
- `npm test` passed 40/40 tests in `local-npm-test.log`.

`npm run check:changeset` was also run before committing and failed because the validator compares committed diffs against `origin/main`; that expected local pre-commit failure is saved in `local-check-changeset.log`.

## Residual Risk

The checkout warning can only be fully verified in GitHub Actions on the pushed PR branch because the warning originates inside `actions/checkout`. The workflow contract test and local Git experiment cover the intended mechanism, and the pushed PR run should confirm the checkout logs are clean.
