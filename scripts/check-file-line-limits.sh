#!/usr/bin/env bash
set -euo pipefail

LIMIT=1500
WARN_THRESHOLD=1350
FAILURES=()
WARNINGS=()

check_file() {
  local file="$1"
  local hint="${2:-Extract code to keep files under the ${LIMIT} line limit.}"
  local line_count

  if [ ! -f "$file" ]; then
    return
  fi

  line_count=$(wc -l < "$file" | tr -d '[:space:]')
  echo "$file: $line_count lines"

  if [ "$line_count" -gt "$LIMIT" ]; then
    echo "ERROR: $file has $line_count lines (limit: ${LIMIT})"
    echo "::error file=$file::File has $line_count lines (limit: ${LIMIT}). ${hint}"
    FAILURES+=("$file")
  elif [ "$line_count" -gt "$WARN_THRESHOLD" ]; then
    echo "WARNING: $file has $line_count lines (approaching limit of ${LIMIT}, warning threshold: ${WARN_THRESHOLD})"
    echo "::warning file=$file::File has $line_count lines (approaching limit of ${LIMIT}). ${hint}"
    WARNINGS+=("$file")
  fi
}

echo "Checking that JavaScript and Markdown files are under ${LIMIT} lines..."
while IFS= read -r -d '' file; do
  check_file "$file"
done < <(find . -type f \
  \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" -o -name "*.md" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "./docs/case-studies/*/data/*" \
  -print0)

echo ""
echo "Checking that GitHub workflow files are under ${LIMIT} lines..."
if [ -d ".github/workflows" ]; then
  while IFS= read -r -d '' file; do
    check_file "$file" "Move inline scripts to the ./scripts/ folder to reduce file size."
  done < <(find .github/workflows -type f \
    \( -name "*.yml" -o -name "*.yaml" \) \
    -print0)
else
  echo "WARNING: .github/workflows not found, skipping"
fi

echo ""
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  echo "The following files are approaching the ${LIMIT} line limit (>${WARN_THRESHOLD} lines):"
  printf '  %s\n' "${WARNINGS[@]}"
  echo ""
  echo "Consider extracting code before concurrent PRs push files over the hard limit."
  echo ""
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "The following files exceed the ${LIMIT} line limit:"
  printf '  %s\n' "${FAILURES[@]}"
  echo ""
  echo "Move large inline scripts to ./scripts or split large source files."
  exit 1
fi

echo "All checked files are within the ${LIMIT} line limit!"
