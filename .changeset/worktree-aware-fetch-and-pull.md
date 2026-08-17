---
"gh-pull-all": minor
---

Support all active git worktrees. Fetch and pull every linked worktree in addition to the main one, run `--switch-to-default` and `--pull-changes-to-fork` in the worktree that holds the target branch, and check uncommitted changes in all worktrees before `--delete` removes a repository. Use `--no-worktrees` to restrict operations to the main worktree.
