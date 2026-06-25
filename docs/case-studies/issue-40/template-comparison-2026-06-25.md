# Template Comparison, 2026-06-25

PR comment reviewed: https://github.com/link-foundation/gh-pull-all/pull/41#issuecomment-3013625201

Compared repositories:

- `link-foundation/js-ai-driven-development-pipeline-template`
- `link-foundation/rust-ai-driven-development-pipeline-template`
- `link-foundation/python-ai-driven-development-pipeline-template`
- `link-foundation/csharp-ai-driven-development-pipeline-template`

Artifacts:

- `template-file-tree-all-2026-06-25.txt`: full file-tree snapshots for all four templates.
- `template-ci-file-tree-all-2026-06-25.txt`: CI/CD-relevant file-tree snapshots for all four templates.
- `recent-runs-after-pr-comment.json`: recent PR runs used to verify that the failed run was created for the latest `.gitkeep`-only commit.
- `ci-checks-and-release-28186347760.json`: metadata for the failed run.
- `ci-checks-and-release-28186347760.log`: log for the failed run.

## Findings

All four templates already use a release-workflow change-detection pattern before expensive validation jobs. The implementations vary by language ecosystem, but the shared shape is the same: detect changed file categories first, expose them as job outputs, and gate downstream jobs with job-level `if:` conditions.

The same defect was not found in the templates. No template issue was opened.

## Applied Back To This PR

This PR now follows that template pattern for pull requests:

- `detect-changes` checks out full history and runs `scripts/detect-code-changes.mjs`.
- The `test` job depends on `detect-changes`.
- Pull request test execution is gated by code, script, package, and workflow change outputs.
- Documentation-only and placeholder-only latest PR commits do not trigger the full test job.
- Pushes to `main` and manual `workflow_dispatch` runs still run tests before release.

The regression test in `tests/test-detect-code-changes.mjs` covers the exact `.gitkeep`-only case and a synthetic pull request merge commit where an earlier code commit exists but the latest PR head commit is non-code.
