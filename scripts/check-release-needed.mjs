#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { formatNpmPackageVersion, readPackageInfo } from './package-info.mjs';

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

function isVersionPublished(packageName, version) {
  const result = spawnSync(
    'npm',
    ['view', formatNpmPackageVersion(packageName, version), 'version'],
    { encoding: 'utf8' }
  );

  return result.status === 0 && result.stdout.trim() === version;
}

const hasChangesets = process.env.HAS_CHANGESETS === 'true';
const { name, version } = readPackageInfo();

console.log(`Package: ${name}`);
console.log(`Current version: ${version}`);
console.log(`Has changesets: ${hasChangesets}`);

if (hasChangesets) {
  console.log('Pending changesets found; release workflow should bump version first.');
  setOutput('should_release', 'true');
  setOutput('skip_bump', 'false');
  process.exit(0);
}

if (isVersionPublished(name, version)) {
  console.log(`${formatNpmPackageVersion(name, version)} is already published.`);
  setOutput('should_release', 'false');
  setOutput('skip_bump', 'false');
} else {
  console.log(`${formatNpmPackageVersion(name, version)} is not published yet.`);
  setOutput('should_release', 'true');
  setOutput('skip_bump', 'true');
}
