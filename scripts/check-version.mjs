#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    throw error;
  }
}

function shouldSkipVersionCheck() {
  const headRef = process.env.GITHUB_HEAD_REF || '';
  return headRef.startsWith('changeset-release/') || headRef.startsWith('changeset-manual-release-');
}

function getVersionDiff() {
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  runGit(['fetch', 'origin', baseRef], { allowFailure: true });
  return runGit(['diff', `origin/${baseRef}...HEAD`, '--', 'package.json'], { allowFailure: true });
}

console.log('Checking for manual version changes in package.json.');

if (shouldSkipVersionCheck()) {
  console.log(`Skipping automated release branch: ${process.env.GITHUB_HEAD_REF}`);
  process.exit(0);
}

const diff = getVersionDiff();
const versionChange = diff.match(/^\+\s*"version"\s*:\s*"[^"]+"/m);

if (versionChange) {
  console.error('::error::Manual package.json version change detected.');
  console.error('Use a changeset instead; release automation updates package versions on main.');
  console.error(`Detected change: ${versionChange[0]}`);
  process.exit(1);
}

console.log('No manual version changes detected.');
