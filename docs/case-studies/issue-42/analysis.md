# Issue 42 case study: CI false positives and errors

Issue: https://github.com/link-foundation/gh-pull-all/issues/42

Pull request: https://github.com/link-foundation/gh-pull-all/pull/43

## Evidence collected

- `gh-data/run-28197242012.json`: metadata for the failed `Checks and release` run referenced by the issue.
- `ci-logs/run-28197242012.log`: full log for failed run `28197242012`.
- `gh-data/run-28199089598.json`: metadata for the first PR CI run after the initial fix.
- `ci-logs/run-28199089598.log`: full log for PR run `28199089598`, which exposed the live-clone timeout false positive.
- `gh-data/recent-runs-issue-branch.json`: recent CI runs for branch `issue-42-065c709658c4`.
- `gh-data/issue-42-comments.json`: issue comments, empty at investigation time.
- `templates/*-repo.json`: repository metadata for the four referenced CI/CD templates.
- `templates/*-tree.json` and `templates/*-file-tree.txt`: full template file trees.
- `templates/*-ci-files.txt`: workflow and CI/CD candidate paths from each template tree.
- `templates/*-release.yml`: release workflows downloaded from each template.
- `templates/*detect*`: change-detection scripts downloaded from each template.
- `ci-logs/local-test-issue-11-direct-before.log`: direct local reproduction before the fix.
- `ci-logs/local-test-issue-11-runner-cwd-before.log`: CI-cwd local comparison before the fix.
- `ci-logs/local-node24-test-issue-11-runner-cwd-before.log`: Node 24 local comparison before the fix.
- `ci-logs/local-test-issue-11-*-after*.log`: local verification logs after the fixes.
- `ci-logs/local-*-after-local-gh-fixture.log`: final verification logs after replacing live GitHub clone dependencies with a local `gh` fixture.

## Timeline

- 2026-06-25 20:05:57 UTC: GitHub Actions run `28197242012` started on `main` for merge commit `9bb1f95aa2562ba154ad6bd4c075da9da763eb30`.
- 2026-06-25 20:06:01 UTC: `detect-changes` compared `HEAD^1` to `HEAD` and found code, workflow, package, script, and documentation changes.
- 2026-06-25 20:06:14 UTC: the `Test` job started `npm run test:ci`.
- 2026-06-25 20:10:06 UTC: `test-issue-11-integration.mjs` failed after about 131 seconds.
- 2026-06-25 20:13:01 UTC: the test suite reported `Passed: 30/31 tests` and `Failed: 1/31 tests`.
- 2026-06-25 20:13:04 UTC: the `Release` job was skipped because `Test` failed.
- 2026-06-25 20:22:00 UTC: the prepared PR branch ran CI on placeholder commit `525c43f91e41617e06086970842601c915e95c3e`; `Detect Changes` passed and `Test` was skipped because no code changed.
- 2026-06-25 20:39:58 UTC: PR run `28199089598` started for commit `d059c25b2f8aa9eeb9f33a0cc2600198143f28b9`.
- 2026-06-25 20:43:03 UTC: the issue-11 success scenario timed out while cloning live `octocat` repositories from GitHub.
- 2026-06-25 20:45:05 UTC: PR run `28199089598` failed with `Passed: 30/31 tests`.

## Requirements extracted from the issue

1. Download all logs and data related to the CI failure into `docs/case-studies/issue-42`.
2. Reconstruct the event timeline and identify root causes.
3. Compare the repository CI/CD files against the JS, Rust, Python, and C# templates.
4. Search online for additional current CI/CD facts and record relevant findings.
5. Fix all false positives and errors found in this repository.
6. If the same issue is present in a referenced template, report it there with reproduction details.
7. If root cause evidence is insufficient, add debug or verbose output with default state off.

## Online references checked

- GitHub Actions workflow syntax documents `jobs.<job_id>.timeout-minutes` and the default 360 minute job timeout: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- GitHub Actions concurrency documentation describes `concurrency` groups and `cancel-in-progress`: https://docs.github.com/enterprise-cloud@latest/actions/using-jobs/using-concurrency
- The `actions/checkout` README documents that only one commit is fetched by default and `fetch-depth: 0` fetches full history: https://github.com/actions/checkout
- npm trusted publishing documentation describes GitHub Actions OIDC publishing without long-lived npm tokens: https://docs.npmjs.com/trusted-publishers/

## Root causes

### 1. Historical CI failure was under-diagnosed

The failed run identifies `test-issue-11-integration.mjs`, but `tests/test-all.mjs` printed only the first 200 characters of the child test stdout and did not print stderr. That made the exact failing subcase unrecoverable from the GitHub Actions log.

Fix: `tests/test-all.mjs` now prints up to 4000 characters each of stdout and stderr for failed child test processes. This is intentionally diagnostic only; it does not alter passing behavior.

### 2. Issue 11 integration test used a cwd-sensitive CLI path

The test executed `../gh-pull-all.mjs` through a shell command. That works only when the process cwd is `tests/`. Running the same test directly from the repository root points outside the repository and produces a misleading failure: `No short error format found`.

Reproduction:

```bash
node tests/test-issue-11-integration.mjs
```

Before fix result:

```text
No short error format found in Multi-threaded with live updates
```

Fix: the test now resolves `gh-pull-all.mjs` from `import.meta.url` and invokes it with `execFileSync(process.execPath, [scriptPath, ...args])`.

### 3. Issue 11 integration test shared fixed temp paths

The test used fixed paths under `/tmp`:

- `/tmp/gh-pull-all-test-issue-11-integration`
- `/tmp/gh-pull-all-test-issue-11-clean`

Running two copies of the same integration test at once let one invocation remove or pollute the other invocation's directories. That caused the clean success case to see conflict output from the other process.

Reproduction:

```bash
node tests/test-issue-11-integration.mjs
node test-issue-11-integration.mjs
```

Run concurrently before the unique temp fix, one invocation failed with:

```text
Success case should not contain error messages
```

Fix: the test now creates a unique temp root with `fs.mkdtemp(path.join(os.tmpdir(), 'gh-pull-all-test-issue-11-'))` and keeps both integration and clean directories under that root.

### 4. Issue 11 success scenario depended on live GitHub clone timing

PR run `28199089598` proved that the clean success scenario still depended on external state. It ran `gh-pull-all.mjs --user octocat --threads 1` against live GitHub data. In CI, `octocat` resolved to 100 repositories and the child command hit the test's 30 second timeout while cloning. The product command was still doing real work; the test failed because it used live repository count, network speed, and GitHub availability as success criteria.

Fix: the test now builds two local bare repositories and puts a fake `gh` executable at the front of `PATH`. The fake `gh repo list` returns only those local repositories. The integration test still exercises the real `gh-pull-all.mjs` CLI, GitHub CLI discovery path, clone path, short status errors, and success status output, but it no longer relies on live GitHub repository state.

## Template comparison findings

All four referenced templates use a single `release.yml` style workflow with explicit job timeouts and change detection. This repository already has the issue-relevant parts that prevented the earlier issue 40 release failures:

- single `Checks and release` workflow in `.github/workflows/release.yml`
- `detect-changes` job with `fetch-depth: 0`
- explicit `timeout-minutes`
- branch-aware concurrency
- npm OIDC trusted publishing permissions on release only
- release gated on successful tests

The JS template has a larger policy surface than this package: compilation, line limits, version/change checks, changesets, lint/format/duplication, docs validation, and a Node/Bun/Deno multi-OS matrix. Those jobs depend on files and npm scripts that do not exist in this repository, so blindly copying them would introduce new failures rather than resolve issue 42.

The Rust, Python, and C# templates contain language-specific equivalents: lockfile and manifest checks, package build checks, coverage or matrix jobs, and release jobs for crates, PyPI, or NuGet. They are useful as design references but do not contain the `test-issue-11-integration.mjs` cwd/temp-dir pattern that caused the concrete failure here.

No matching template issue was opened because the reproduced problems are specific to this repository's issue-11 integration test and test runner diagnostics. The downloaded template trees and release workflows are stored in this case-study folder for future audit.

## Applied solution

1. `tests/test-issue-11-integration.mjs`
   - Resolve the CLI script path from the test file location, not cwd.
   - Use `execFileSync` with `process.execPath` and argument arrays instead of shell command strings.
   - Allocate unique temp directories per invocation.
   - Create local bare repositories and a fake `gh` CLI fixture for deterministic repository lists.
   - Include command output in assertion failures when expected short error formatting is missing.

2. `tests/test-all.mjs`
   - Add the issue-11 test description to CI output.
   - Preserve bounded stdout and stderr from failing child tests.

3. `docs/case-studies/issue-42/`
   - Store GitHub run data, logs, local reproductions, template trees, template CI files, and this analysis.

## Verification

Before fix:

```bash
node tests/test-issue-11-integration.mjs > docs/case-studies/issue-42/ci-logs/local-test-issue-11-direct-before.log 2>&1
```

Result: failed with `No short error format found in Multi-threaded with live updates`.

After cwd fix and unique temp fix:

```bash
node tests/test-issue-11-integration.mjs > docs/case-studies/issue-42/ci-logs/local-test-issue-11-direct-after-unique-temp.log 2>&1
node test-issue-11-integration.mjs > ../docs/case-studies/issue-42/ci-logs/local-test-issue-11-runner-cwd-after-unique-temp.log 2>&1
```

Result: both passed when run concurrently.

Full final check commands and PR CI results are recorded in the pull request description after verification.

After replacing the live GitHub dependency with the local fixture:

```bash
node tests/test-issue-11-integration.mjs > docs/case-studies/issue-42/ci-logs/local-test-issue-11-after-local-gh-fixture.log 2>&1
npx -y node@24 tests/test-issue-11-integration.mjs > docs/case-studies/issue-42/ci-logs/local-node24-test-issue-11-after-local-gh-fixture.log 2>&1
npm run check:syntax > docs/case-studies/issue-42/ci-logs/local-check-syntax-after-local-gh-fixture.log 2>&1
npm run check:line-limits > docs/case-studies/issue-42/ci-logs/local-check-line-limits-after-local-gh-fixture.log 2>&1
node tests/test-all.mjs > docs/case-studies/issue-42/ci-logs/local-test-all-after-local-gh-fixture.log 2>&1
```

Result: all commands passed locally. The full suite reported `Passed: 31/31 tests`.
