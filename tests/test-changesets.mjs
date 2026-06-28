#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');

function runNodeScript(script, { cwd = rootDir, env = {} } = {}) {
  return execFileSync(process.execPath, [resolve(rootDir, script)], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_SHA: '',
      GITHUB_BASE_REF: '',
      GITHUB_BASE_SHA: '',
      GITHUB_HEAD_SHA: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const outputDir = mkdtempSync(join(tmpdir(), 'gh-pull-all-changesets-'));
const checkFixtureDir = join(outputDir, 'check-fixture');
const validateFixtureDir = join(outputDir, 'validate-fixture');

function writeFixture(root, { includeNotes = false } = {}) {
  mkdirSync(join(root, '.changeset'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'gh-pull-all', version: '0.0.0' }, null, 2)}\n`
  );
  writeFileSync(join(root, '.changeset', 'README.md'), '# Changesets\n');
  writeFileSync(
    join(root, '.changeset', 'valid-change.md'),
    `---
'gh-pull-all': patch
---

Fix a release-impacting behavior.
`
  );

  if (includeNotes) {
    writeFileSync(
      join(root, '.changeset', 'notes.md'),
      '# Notes\n\nThis markdown file is not a changeset.\n'
    );
  }
}

try {
  writeFixture(checkFixtureDir, { includeNotes: true });
  writeFixture(validateFixtureDir);

  const githubOutput = join(checkFixtureDir, 'github-output.txt');
  const checkOutput = runNodeScript('scripts/check-changesets.mjs', {
    cwd: checkFixtureDir,
    env: { GITHUB_OUTPUT: githubOutput },
  });

  assert.match(checkOutput, /Found 1 changeset file\(s\)/);
  const outputs = Object.fromEntries(
    readFileSync(githubOutput, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('='))
  );
  assert.equal(outputs.has_changesets, 'true');
  assert.equal(outputs.changeset_count, '1');

  const validateOutput = runNodeScript('scripts/validate-changeset.mjs', {
    cwd: validateFixtureDir,
  });
  assert.match(validateOutput, /Changeset validation passed/);
  assert.match(validateOutput, /Type: patch/);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

console.log('Changeset scripts are valid.');
