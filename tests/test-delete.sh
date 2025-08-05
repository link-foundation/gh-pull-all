#!/bin/bash

# Test script for delete mode functionality

echo "🧪 Testing gh-pull-all delete mode..."

# Create a test directory
TEST_DIR="/tmp/gh-pull-all-test"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "📁 Created test directory: $TEST_DIR"

# Create some fake repositories
for i in 1 2 3; do
  REPO_DIR="$TEST_DIR/test-repo-$i"
  mkdir -p "$REPO_DIR"
  cd "$REPO_DIR"
  git init
  echo "Test content $i" > "file$i.txt"
  git add .
  git commit -m "Initial commit"
  cd - > /dev/null
  echo "✅ Created test repository: test-repo-$i"
done

# Create a repo with uncommitted changes
UNCOMMITTED_REPO="$TEST_DIR/test-repo-uncommitted"
mkdir -p "$UNCOMMITTED_REPO"
cd "$UNCOMMITTED_REPO"
git init
echo "Initial content" > file.txt
git add .
git commit -m "Initial commit"
echo "Modified content" > file.txt
cd - > /dev/null
echo "✅ Created repository with uncommitted changes: test-repo-uncommitted"

# Create a non-git directory
NON_GIT_DIR="$TEST_DIR/not-a-repo"
mkdir -p "$NON_GIT_DIR"
echo "Not a git repo" > "$NON_GIT_DIR/file.txt"
echo "✅ Created non-git directory: not-a-repo"

echo ""
echo "📊 Test directory structure:"
ls -la "$TEST_DIR"

echo ""
echo "🔍 Checking uncommitted changes in test-repo-uncommitted:"
cd "$UNCOMMITTED_REPO" && git status --short && cd - > /dev/null

echo ""
echo "⚠️  This test script sets up test repositories in $TEST_DIR"
echo "Run the following command to test delete mode:"
echo ""
echo "node gh-pull-all.mjs --user test --delete --dir $TEST_DIR"
echo ""
echo "Expected behavior:"
echo "  - test-repo-1, test-repo-2, test-repo-3: Should be deleted"
echo "  - test-repo-uncommitted: Should be skipped (has uncommitted changes)"
echo "  - not-a-repo: Should be skipped (not a git repository)"