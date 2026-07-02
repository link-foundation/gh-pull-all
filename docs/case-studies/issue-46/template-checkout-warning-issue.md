The release workflow uses `actions/checkout@v6` but does not set Git's default initial branch before checkout runs. On GitHub-hosted runners with Git 2.54, checkout initializes the repository before any user-defined step can run and emits this warning:

```text
hint: Using 'master' as the name for the initial branch. This default branch name
hint: will change to "main" in Git 3.0. To configure the initial branch name
hint: to use in all of your new repositories, which will suppress this warning,
hint: call:
hint:
hint:  git config --global init.defaultBranch <name>
```

Observed example: https://github.com/link-foundation/gh-pull-all/actions/runs/28363495995

Related downstream fix: https://github.com/link-foundation/gh-pull-all/pull/47

## Reproduction

1. Run any workflow job in this template that starts with `actions/checkout@v6` on a runner where Git emits the Git 3.0 default-branch hint.
2. Inspect the checkout log. The warning appears during checkout's internal `git init`, before a normal workflow step could run `git config --global init.defaultBranch main`.

Local reproduction of the workaround:

```bash
git init /tmp/git-default-branch-warning

GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=init.defaultBranch \
GIT_CONFIG_VALUE_0=main \
git init /tmp/git-default-branch-configured
```

The configured command initializes the repository without the default-branch hint.

## Workaround

Set Git runtime config at workflow scope so it is present for `actions/checkout` itself, not only for later shell steps:

```yaml
env:
  GIT_CONFIG_COUNT: '1'
  GIT_CONFIG_KEY_0: init.defaultBranch
  GIT_CONFIG_VALUE_0: main
```

## Suggested Fix

Add the workflow-level env block above to `.github/workflows/release.yml` and add a workflow contract test that asserts it remains present. This keeps CI logs free of false-positive warnings and avoids relying on runner-global Git configuration.
