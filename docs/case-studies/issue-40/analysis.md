# Issue 40 CI/CD Case Study

## Scope

Issue: https://github.com/link-foundation/gh-pull-all/issues/40

Pull request: https://github.com/link-foundation/gh-pull-all/pull/41

Template compared: https://github.com/link-foundation/js-ai-driven-development-pipeline-template

The issue asked to replace the broken npm publishing workflow with current CI/CD best practices, reuse the relevant parts of the template repository, support npm trusted publishing, create GitHub releases, add badges, download related evidence into this repository, and preserve a deep root-cause analysis.

## Evidence Collected

- `issue.json`: issue body, metadata, and requirements.
- `issue-comments.json`: issue discussion snapshot.
- `pr-41.json`, `pr-41-conversation-comments.json`, `pr-41-review-comments.json`, `pr-41-reviews.json`: prepared PR state and comments.
- `failing-run-28167007698.json`: failed GitHub Actions run metadata.
- `publish-28167007698.log`: failed workflow log.
- `trusted-publishing-settings.png`: screenshot from the issue, downloaded and verified as a PNG before visual inspection.
- `template-file-tree.txt`, `template-release.yml`, `template-package.json`: local snapshot of the CI/CD template inputs used for comparison.
- `current-file-tree.txt`: local repository file tree after applying the relevant CI/CD changes.
- `final3-npm-test.log`: final full local test run after the Node 24 helper import fix.
- `ci-checks-and-release-28184079481.log`: first PR CI run after replacing the workflow, kept because it exposed a Node 24/use-m export-shape difference not visible in the local Node 20 run.
- `ci-checks-and-release-28184580314.log`: second PR CI run, kept because it exposed a CI cleanup race in `test-parallel.mjs`.
- `final4-npm-test.log`: final full local test run after hardening `test-parallel.mjs` cleanup.

## Timeline

- 2026-06-25 11:30:53 UTC: GitHub Actions run `28167007698` started on `main` for SHA `866b5384754bc8d8aa90e16c248e753e81b931eb`.
- 2026-06-25 11:31:00 UTC: the `Publish to NPM` workflow ran `bun publish -p --access public`.
- 2026-06-25 11:31:00 UTC: npm publishing failed with `404 Not Found: https://registry.npmjs.org/gh-pull-all` and `gh-pull-all@1.4.2 does not exist in this registry`.
- 2026-06-25 15:21:41 UTC: issue #40 was opened and stated that npm trusted publishing had been configured.
- 2026-06-25 15:22:39 UTC: draft PR #41 was opened from `issue-40-5461509fea36`.

## Requirements From The Issue

- Download logs and issue/PR data into `docs/case-studies/issue-40`.
- Reconstruct the failure timeline.
- Identify root causes rather than only patching symptoms.
- Compare the full repository tree against the CI/CD template and reuse relevant workflow/script practices.
- Completely replace `publish.yml` with `release.yml`.
- Support npm trusted publishing.
- Add GitHub releases.
- Add README and release badges.
- Add or update CI/CD scripts needed by the workflow.
- Verify the solution with tests and preserve useful logs.

## External Facts Used

- npm trusted publishing is tied to a configured GitHub repository, workflow filename, and environment, and requires the workflow file to live under `.github/workflows/`: https://docs.npmjs.com/trusted-publishers/
- npm trusted publishing requires modern npm and Node versions for OIDC publishing. This solution enforces Node `>=22.14.0` and npm `>=11.5.1` inside the release job setup script: https://docs.npmjs.com/trusted-publishers/
- npm provenance/trusted publishing workflows need `id-token: write` permission and should use `npm publish --access public` for a first public package publish: https://docs.npmjs.com/generating-provenance-statements/
- GitHub workflow permissions and event syntax are defined by GitHub Actions workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub releases can be created or updated through the GitHub Releases REST API, which is what the release script invokes via `gh api`: https://docs.github.com/en/rest/releases/releases

## Root Causes

1. The trusted publisher was configured for `release.yml`, but the repository only had `.github/workflows/publish.yml`.

   The screenshot in the issue shows npm trusted publishing configured for workflow filename `release.yml`. The failing run came from workflow `Publish to NPM`, which was backed by `publish.yml`. That mismatch prevented the configured trusted publisher path from being the steady-state release path.

2. The old workflow used Bun publishing instead of npm's trusted publishing path.

   The failed log shows `bun publish -p --access public` with `NPM_CONFIG_TOKEN`. The trusted publishing best practice is to use npm CLI with GitHub OIDC permissions instead of treating publishing as a Bun/token-only operation.

3. The workflow had no reliable release gate before publishing.

   Tests were commented out in the old publish workflow, so publishing could run even when repository checks were not being exercised in CI.

4. The repository did not create GitHub releases for npm releases.

   The old workflow stopped at npm publishing, so GitHub release metadata, badges, and release body links were missing.

5. Local executable tests could prefer Bun when Bun was installed.

   The CLI launcher selected Bun before Node. In this environment Bun failed to load the current Octokit dependency graph. The package and CI now use Node as the primary runtime, so the launcher now prefers Node and only falls back to Bun when Node is unavailable.

6. The Node 24 GitHub runner exposed a different `yargs/helpers` module shape through `use-m`.

   The first PR CI run for this branch failed with `TypeError: hideBin is not a function`. Local Node 20 exposed `hideBin` as a named export, while the runner path did not. The CLI now accepts named-export, default-export, and minimal fallback forms for `hideBin`.

7. `test-parallel.mjs` could leave a nested `git` process writing pack files after the test killed the direct CLI child.

   The second PR CI run failed with `ENOTEMPTY: directory not empty, rmdir '/tmp/test-parallel-demo/accessibility-alt-text-bot/.git/objects/pack'`. The test intentionally starts a real `github` user sync, waits briefly, and terminates it after verifying initialization output. On GitHub runners, killing only the direct Node process could leave a descendant `git` process writing `.git/objects/pack` while the after-hook removed the shared temp directory. The test now uses a unique temp directory, terminates the process group on POSIX systems, and uses retrying recursive cleanup.

## Template Comparison

Relevant template practices applied:

- Single `release.yml` workflow as the publish/release entry point.
- Separate test job before release.
- Node-based release tooling rather than inline shell publishing logic.
- Explicit workflow permissions, including `id-token: write` only for the release job.
- npm setup script that verifies modern Node/npm for trusted publishing.
- Release-needed check before publishing.
- npm publish script with post-publish verification.
- Published-package smoke test.
- GitHub release creation with npm and workflow badges in release notes.
- README workflow/release badges.
- Syntax and file-line-limit checks.

Template practices intentionally not applied:

- Changesets, because this repository already has a simple version script and the issue did not request a versioning-system migration.
- Docker publishing, Deno publishing, example app workflows, preview image generation, and web archive checks because this repository is a single npm CLI package.
- ESLint/Prettier/jscpd template setup because introducing a new formatting/lint stack would expand the scope beyond the CI/CD publishing failure.

## Implemented Solution

- Replaced `.github/workflows/publish.yml` with `.github/workflows/release.yml`.
- Added a `test` job that installs dependencies, checks syntax, checks file line limits, and runs the full test suite.
- Added a release job gated to `main` pushes and `workflow_dispatch`.
- Added release job permissions `contents: write` and `id-token: write`.
- Added release scripts:
  - `scripts/package-info.mjs`
  - `scripts/setup-npm.mjs`
  - `scripts/check-release-needed.mjs`
  - `scripts/publish-to-npm.mjs`
  - `scripts/smoke-test-package.mjs`
  - `scripts/create-github-release.mjs`
  - `scripts/check-mjs-syntax.sh`
  - `scripts/check-file-line-limits.sh`
- Added npm scripts for CI and release operations.
- Added `publishConfig.access = public`.
- Kept package runtime support at Node `>=20.0.0` while enforcing trusted-publishing requirements in the release job.
- Updated README with npm, GitHub release, and `release.yml` workflow badges.
- Added `tests/test-release-workflow.mjs` to lock the new release workflow contract.
- Updated legacy tests to run child test files through the active Node runtime and match the current error message format.
- Updated the CLI launcher to prefer Node before Bun.
- Fixed help/version flow so `--help` and `--version` do not enter repository-processing logic.
- Normalized `-j` thread option parsing so the short alias behaves consistently.
- Hardened `test-parallel.mjs` cleanup so CI does not fail on a transient temp-directory removal race after terminating a real sync process.

## Verification

Final successful checks:

- `node tests/test-release-workflow.mjs`
  - Log: `final3-test-release-workflow.log`
- `npm run check:syntax`
  - Log: `final4-check-syntax.log`
- `npm run check:line-limits`
  - Log: `final4-check-line-limits.log`
- `node test-parallel.mjs` from `tests/`
  - Log: `final4-test-parallel.log`
- `npm run release:needed`
  - Log: `final-release-needed.log`
- `npm pack --dry-run`
  - Log: `final-npm-pack-dry-run.log`
- `npm test`
  - Log: `final4-npm-test.log`
  - Result: `Passed: 30/30 tests`

Intermediate failing logs are intentionally preserved in this folder because they show the investigation path and distinguish the original CI failure from local runtime/test brittleness encountered during the fix.

## Remaining Risks

- The actual npm publish step cannot be fully verified from this pull request branch because trusted publishing is configured for the repository's release workflow and will execute only in GitHub Actions on the release path.
- The release workflow includes an optional `NODE_AUTH_TOKEN` fallback for bootstrap/recovery, but the intended steady-state path is npm trusted publishing through OIDC.
- The package version `1.4.2` was not visible in npm during the failed run. The release script treats an already-published version as successful/idempotent and publishes only when npm does not already expose the exact package version.
