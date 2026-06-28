#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatNpmPackageVersion, readPackageInfo } from './package-info.mjs';

function readOption(argv, optionName) {
  const index = argv.indexOf(optionName);
  if (index === -1) {
    return '';
  }

  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

const packageVersion = readOption(process.argv.slice(2), '--package-version');
if (!packageVersion) {
  throw new Error('Usage: node scripts/smoke-test-package.mjs --package-version <version>');
}

const { name } = readPackageInfo();
const packageSpec = formatNpmPackageVersion(name, packageVersion);
const workspace = mkdtempSync(join(tmpdir(), 'gh-pull-all-smoke-'));

try {
  writeFileSync(
    join(workspace, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2)
  );

  execFileSync('npm', ['install', packageSpec, '--no-audit', '--no-fund'], {
    cwd: workspace,
    stdio: 'inherit',
  });

  const binPath = process.platform === 'win32'
    ? join(workspace, 'node_modules', '.bin', 'gh-pull-all.cmd')
    : join(workspace, 'node_modules', '.bin', 'gh-pull-all');

  const help = execFileSync(binPath, ['--help'], {
    cwd: workspace,
    encoding: 'utf8',
  });

  if (!help.includes('Usage: gh-pull-all')) {
    throw new Error('Installed CLI did not print the expected help output.');
  }

  console.log(`Smoke test passed for ${packageSpec}.`);
} finally {
  rmSync(workspace, { force: true, recursive: true });
}
