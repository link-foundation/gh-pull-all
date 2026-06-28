#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getChangesetDir, getJsRoot, parseJsRootConfig } from './js-paths.mjs';
import { getChangesetVersionTypeRegex, readPackageInfo } from './package-info.mjs';

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

function isGitWorktree() {
  return runGit(['rev-parse', '--is-inside-work-tree'], { allowFailure: true }) === 'true';
}

function parseAddedChangesets(diffOutput, changesetDir) {
  const prefix = changesetDir.replace(/\\/g, '/').replace(/^\.\//, '');
  return diffOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([status, filePath]) =>
      status === 'A' &&
      filePath.startsWith(`${prefix}/`) &&
      filePath.endsWith('.md') &&
      !filePath.endsWith('/README.md')
    )
    .map(([, filePath]) => filePath.slice(prefix.length + 1));
}

function ensureCommitAvailable(sha) {
  if (!sha || runGit(['cat-file', '-e', sha], { allowFailure: true })) {
    return;
  }

  console.log(`Commit ${sha} is not available locally; fetching from origin.`);
  if (!runGit(['fetch', 'origin', sha], { allowFailure: true })) {
    runGit(['fetch', 'origin']);
  }
}

function getAddedChangesets(changesetDir) {
  const baseSha = process.env.GITHUB_BASE_SHA || process.env.BASE_SHA;
  const headSha = process.env.GITHUB_HEAD_SHA || process.env.HEAD_SHA;

  if (baseSha && headSha) {
    ensureCommitAvailable(baseSha);
    console.log(`Comparing ${baseSha}...${headSha}`);
    const diff = runGit(['diff', '--name-status', baseSha, headSha]);
    return parseAddedChangesets(diff, changesetDir);
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    runGit(['fetch', 'origin', baseRef], { allowFailure: true });
    console.log(`Comparing origin/${baseRef}...HEAD`);
    const diff = runGit(['diff', '--name-status', `origin/${baseRef}...HEAD`]);
    return parseAddedChangesets(diff, changesetDir);
  }

  if (isGitWorktree()) {
    runGit(['fetch', 'origin', 'main'], { allowFailure: true });
    if (runGit(['rev-parse', '--verify', 'origin/main'], { allowFailure: true })) {
      console.log('No PR base context found; comparing origin/main...HEAD.');
      const diff = runGit(['diff', '--name-status', 'origin/main...HEAD']);
      return parseAddedChangesets(diff, changesetDir);
    }
  }

  console.log('No PR base context found; validating all local changesets.');
  if (!existsSync(changesetDir)) {
    return [];
  }
  return readdirSync(changesetDir).filter((file) => file.endsWith('.md') && file !== 'README.md');
}

function validateChangeset(filePath, packageName) {
  const content = readFileSync(filePath, 'utf8');
  const versionTypeRegex = getChangesetVersionTypeRegex(packageName, { requireQuotes: false });
  const versionTypeMatch = content.match(versionTypeRegex);

  if (!versionTypeMatch) {
    throw new Error(
      `Changeset must declare ${packageName} with a major, minor, or patch bump.`
    );
  }

  const parts = content.split('---');
  const description = parts.length >= 3 ? parts.slice(2).join('---').trim() : '';
  if (!description) {
    throw new Error('Changeset must include a non-empty description.');
  }

  return { type: versionTypeMatch[1], description };
}

try {
  const jsRoot = getJsRoot({ jsRoot: parseJsRootConfig(), verbose: true });
  const changesetDir = getChangesetDir({ jsRoot });
  const { name: packageName } = readPackageInfo({ jsRoot });
  const addedChangesets = getAddedChangesets(changesetDir);

  console.log(`Package: ${packageName}`);
  console.log(`Found ${addedChangesets.length} added changeset file(s).`);
  addedChangesets.forEach((file) => console.log(`  - ${file}`));

  if (addedChangesets.length === 0) {
    console.error("::error::No changeset found. Add one with 'npm run changeset'.");
    process.exit(1);
  }

  if (addedChangesets.length > 1) {
    console.error('::error::Multiple changesets found. Keep exactly one changeset per PR.');
    process.exit(1);
  }

  const result = validateChangeset(join(changesetDir, addedChangesets[0]), packageName);
  console.log('Changeset validation passed.');
  console.log(`Type: ${result.type}`);
  console.log(`Description: ${result.description}`);
} catch (error) {
  console.error(`::error::${error.message}`);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
