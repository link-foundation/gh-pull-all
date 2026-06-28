#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { readPackageInfo } from './package-info.mjs';

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

function buildReleaseBody({ packageName, repository, version }) {
  return [
    `[![npm version](https://img.shields.io/npm/v/${packageName})](https://www.npmjs.com/package/${packageName})`,
    `[![Checks and release](https://github.com/${repository}/actions/workflows/release.yml/badge.svg)](https://github.com/${repository}/actions/workflows/release.yml)`,
    '',
    `## ${packageName} ${version}`,
    '',
    'Install from npm:',
    '',
    '```bash',
    `npm install -g ${packageName}`,
    '```',
    '',
    `Package: https://www.npmjs.com/package/${packageName}/v/${version}`,
    `Source: https://github.com/${repository}`,
  ].join('\n');
}

function runGh(args, input) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
  });

  if (result.status === 0) {
    return result;
  }

  const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  throw new Error(output || `gh exited with status ${result.status}`);
}

const argv = process.argv.slice(2);
const releaseVersion = readOption(argv, '--release-version');
const repository = readOption(argv, '--repository') || process.env.GITHUB_REPOSITORY;

if (!releaseVersion || !repository) {
  throw new Error('Usage: node scripts/create-github-release.mjs --release-version <version> --repository <owner/repo>');
}

const packageInfo = readPackageInfo();
const tag = `v${releaseVersion}`;
const body = buildReleaseBody({
  packageName: packageInfo.name,
  repository,
  version: releaseVersion,
});

const payload = JSON.stringify({
  body,
  make_latest: 'true',
  name: `${packageInfo.name} ${releaseVersion}`,
  tag_name: tag,
});

try {
  runGh(['api', `repos/${repository}/releases`, '-X', 'POST', '--input', '-'], payload);
  console.log(`Created GitHub release ${tag}.`);
} catch (error) {
  if (/already_exists|already exists/i.test(error.message)) {
    const release = runGh(
      ['api', `repos/${repository}/releases/tags/${tag}`, '--jq', '.id'],
      undefined
    );
    const releaseId = release.stdout.trim();
    runGh(['api', `repos/${repository}/releases/${releaseId}`, '-X', 'PATCH', '--input', '-'], payload);
    console.log(`Updated existing GitHub release ${tag}.`);
  } else {
    throw error;
  }
}
