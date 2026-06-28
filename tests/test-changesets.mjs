#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');

function runNodeScript(script, env = {}) {
  return execFileSync(process.execPath, [resolve(rootDir, script)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const outputDir = mkdtempSync(join(tmpdir(), 'gh-pull-all-changesets-'));

try {
  const githubOutput = join(outputDir, 'github-output.txt');
  const checkOutput = runNodeScript('scripts/check-changesets.mjs', {
    GITHUB_OUTPUT: githubOutput,
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

  const validateOutput = runNodeScript('scripts/validate-changeset.mjs');
  assert.match(validateOutput, /Changeset validation passed/);
  assert.match(validateOutput, /Type: minor/);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

console.log('Changeset scripts are valid.');
