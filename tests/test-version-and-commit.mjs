#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const scriptPath = resolve(rootDir, 'scripts/version-and-commit.mjs');

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
}

function git(args, cwd) {
  return run('git', args, { cwd });
}

function parseOutputs(outputPath) {
  return Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function writePackageFixture(repoDir) {
  writeFileSync(
    join(repoDir, 'package.json'),
    `${JSON.stringify({ name: 'gh-pull-all', version: '0.0.0' }, null, 2)}\n`
  );
  writeFileSync(
    join(repoDir, 'gh-pull-all.mjs'),
    "#!/usr/bin/env node\nlet version = '0.0.0' // Fallback version\nconsole.log(version)\n"
  );
}

function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), 'gh-pull-all-version-and-commit-'));
  const remote = join(root, 'origin.git');
  const repo = join(root, 'repo');

  mkdirSync(repo);
  run('git', ['init', '-q', '--bare', '--initial-branch=main', remote]);
  git(['init', '-q', '--initial-branch=main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test User'], repo);
  git(['config', 'commit.gpgsign', 'false'], repo);
  git(['remote', 'add', 'origin', remote], repo);

  writePackageFixture(repo);
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'initial package'], repo);
  git(['push', '-q', '-u', 'origin', 'main'], repo);

  return { remote, repo, root };
}

const { remote, repo, root } = setupRepo();

try {
  const githubOutput = join(repo, 'github-output.txt');
  writeFileSync(githubOutput, '');

  const stdout = run(process.execPath, [scriptPath, '--mode', 'instant', '--bump-type', 'patch'], {
    cwd: repo,
    env: { ...process.env, GITHUB_OUTPUT: githubOutput },
  });

  const outputs = parseOutputs(githubOutput);
  const packageJson = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  const cliSource = readFileSync(join(repo, 'gh-pull-all.mjs'), 'utf8');
  const remotePackage = run('git', ['--git-dir', remote, 'show', 'main:package.json']);

  assert.match(stdout, /Current version: 0\.0\.0/);
  assert.equal(outputs.new_version, '0.0.1');
  assert.equal(outputs.version_committed, 'true');
  assert.equal(outputs.already_released, 'false');
  assert.equal(packageJson.version, '0.0.1');
  assert.match(cliSource, /let version = '0\.0\.1' \/\/ Fallback version/);
  assert.equal(JSON.parse(remotePackage).version, '0.0.1');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Version-and-commit script handles inherited stdio commands.');
