#!/usr/bin/env bash
set -euo pipefail

while IFS= read -r file; do
  if [ ! -f "$file" ]; then
    continue
  fi

  echo "Checking syntax: $file"
  node --check "$file"
done < <(git ls-files --cached --others --exclude-standard '*.mjs')
