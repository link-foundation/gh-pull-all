#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case_dir="${root_dir}/docs/case-studies/issue-38"
work_dir="$(mktemp -d)"
log_file="${case_dir}/empty-remote-reproduction.log"

mkdir -p "${case_dir}"
trap 'rm -rf "${work_dir}"' EXIT

{
  git --version

  remote_dir="${work_dir}/empty-repo.git"
  clone_dir="${work_dir}/empty-repo"

  git init --bare "${remote_dir}"
  git -C "${remote_dir}" symbolic-ref HEAD refs/heads/main

  git clone "${remote_dir}" "${clone_dir}"

  git -C "${clone_dir}" status --short --branch
  git -C "${clone_dir}" config --local --get-regexp '^branch\.main\.'

  git -C "${clone_dir}" fetch --all

  set +e
  git -C "${clone_dir}" pull
  pull_exit=$?
  set -e

  printf 'git pull exit code: %s\n' "${pull_exit}"
} >"${log_file}" 2>&1

printf 'Wrote reproduction log to %s\n' "${log_file}"
