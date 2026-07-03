# gh-pull-all

## 1.5.0

### Minor Changes

- Show concise error numbers in repository status lines while keeping full error details in the final errors section.

  Enable default auto-detection for GitHub users and organizations when neither `--user` nor `--org` is provided.

  Fix full CLI help output for `--help`, `-h`, and `--help true`.

  Fix release version commits when inherited stdio commands return no captured output, run PR CI checks for full pull-request diffs instead of only the latest head commit, and move status display code out of the CLI entrypoint to clear line-limit warnings.

  Add `--pull-changes-to-fork` to update forked repositories from their upstream parent repositories.

  Reenable the fast test suite with local fixtures, shared test utilities, Bun unit tests, and opt-in slow integration coverage.

  Resolve PR 36 against the current codebase while preserving safer CLI startup, progress rendering, git operation, and version bump behavior.

  Suppress Git default-branch hints in CI checkout steps and replace the uncommitted-changes test's live GitHub dependency with a deterministic local fixture.

  Fetch before switching to the default branch and pull the default branch after switching.
