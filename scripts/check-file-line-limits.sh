#!/usr/bin/env bash
set -euo pipefail

max_lines=1500
failed=0

while IFS= read -r file; do
  if [ ! -f "$file" ]; then
    continue
  fi

  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$max_lines" ]; then
    echo "ERROR: $file has $lines lines, which exceeds the $max_lines line limit."
    failed=1
  else
    echo "OK: $file has $lines lines."
  fi
done < <(git ls-files --cached --others --exclude-standard '*.js' '*.cjs' '*.mjs' '*.md' '.github/workflows/*.yml' '.github/workflows/*.yaml')

exit "$failed"
