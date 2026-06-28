#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = resolve(import.meta.dirname, '..');
const scriptPath = resolve(rootDir, 'scripts/detect-code-changes.mjs');

function runGit(repoDir, args) {
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitFile(repoDir, filePath, content, message) {
  const fullPath = join(repoDir, filePath);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
  runGit(repoDir, ['add', filePath]);
  runGit(repoDir, ['commit', '-m', message]);
}

function setupRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), 'detect-code-changes-'));

  runGit(repoDir, ['init', '-b', 'main']);
  runGit(repoDir, ['config', 'user.name', 'Test User']);
  runGit(repoDir, ['config', 'user.email', 'test@example.com']);
  commitFile(repoDir, 'README.md', '# Test\n', 'initial commit');

  return repoDir;
}

function runDetector(repoDir, eventName = 'push') {
  const outputFile = join(repoDir, 'github-output.txt');
  const stdout = execFileSync(process.execPath, [scriptPath], {
    cwd: repoDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_OUTPUT: outputFile,
    },
  });

  const outputs = Object.fromEntries(
    readFileSync(outputFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('='))
  );

  return { stdout, outputs };
}

function withRepo(testFn) {
  const repoDir = setupRepo();
  try {
    testFn(repoDir);
  } finally {
    rmSync(repoDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

withRepo((repoDir) => {
  commitFile(repoDir, '.gitkeep', '', 'remove placeholder equivalent');

  const { outputs, stdout } = runDetector(repoDir);

  assert.match(stdout, /Changed files:\n  \.gitkeep/);
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['mjs-changed'], 'false');
  assert.equal(outputs['workflow-changed'], 'false');
});

withRepo((repoDir) => {
  commitFile(repoDir, 'scripts/example.mjs', 'console.log("ok");\n', 'add script');

  const { outputs } = runDetector(repoDir);

  assert.equal(outputs['any-code-changed'], 'true');
  assert.equal(outputs['mjs-changed'], 'true');
});

withRepo((repoDir) => {
  runGit(repoDir, ['checkout', '-b', 'feature']);
  commitFile(repoDir, 'scripts/example.mjs', 'console.log("ok");\n', 'add script');
  commitFile(repoDir, '.gitkeep', '', 'remove placeholder equivalent');
  runGit(repoDir, ['checkout', 'main']);
  runGit(repoDir, ['merge', '--no-ff', '--no-edit', 'feature']);

  const { outputs, stdout } = runDetector(repoDir, 'pull_request');

  assert.match(stdout, /Comparing HEAD\^2\^ to HEAD\^2/);
  assert.match(stdout, /Changed files:\n  \.gitkeep/);
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['mjs-changed'], 'false');
});

console.log('Change detection behavior is valid.');
