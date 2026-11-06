#!/usr/bin/env bash
# Issue #50: run gh-pull-all's real startup (yargs, hideBin, Octokit, simple-git,
# fs-extra) against several use-m releases, including the ones that changed the
# module shape returned by use() (8.16.2 and 8.16.3).
# Usage: bash experiments/issue-50-use-m-version-matrix.sh [versions...]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSIONS=("$@")
[ ${#VERSIONS[@]} -eq 0 ] && VERSIONS=(8.13.7 8.16.1 8.16.2 8.16.3 8.16.4 latest)
WORK="$(mktemp -d)"
status=0
for v in "${VERSIONS[@]}"; do
  url="https://unpkg.com/use-m@${v}/use.js"
  [ "$v" = latest ] && url="https://unpkg.com/use-m/use.js"
  out="$(cd "$WORK" && GH_PULL_ALL_USE_M_URL="$url" GH_PULL_ALL_DEBUG=1 GITHUB_TOKEN=dummy \
    timeout 300 node "$ROOT/gh-pull-all.mjs" --org nonexistent-org-issue-50 --dir "$WORK/out" --single-thread 2>&1)"
  if grep -q "is not a function\|Could not find" <<<"$out"; then
    echo "use-m $v: FAIL"; grep -m3 "is not a function\|Could not find\|TypeError" <<<"$out"; status=1
  elif grep -q "Starting nonexistent-org-issue-50" <<<"$out"; then
    echo "use-m $v: OK ($(grep -m1 'loaded use-m from' <<<"$out" | sed 's/.*from //'))"
  else
    echo "use-m $v: UNKNOWN"; tail -5 <<<"$out"; status=1
  fi
done
rm -rf "$WORK"
exit $status
