#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { formatNpmPackageVersion, readPackageInfo } from './package-info.mjs';

const VERIFY_ATTEMPTS = 6;
const VERIFY_DELAY_MS = 5000;

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function npmViewVersion(packageName, version) {
  return spawnSync(
    'npm',
    ['view', formatNpmPackageVersion(packageName, version), 'version'],
    { encoding: 'utf8' }
  );
}

function isPublished(packageName, version) {
  const result = npmViewVersion(packageName, version);
  return result.status === 0 && result.stdout.trim() === version;
}

async function waitForPublishedVersion(packageName, version) {
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    if (isPublished(packageName, version)) {
      return true;
    }

    if (attempt < VERIFY_ATTEMPTS) {
      console.log(
        `Package not visible on npm yet; waiting ${VERIFY_DELAY_MS / 1000}s (${attempt}/${VERIFY_ATTEMPTS})...`
      );
      await sleep(VERIFY_DELAY_MS);
    }
  }

  return false;
}

function publishPackage() {
  return spawnSync('npm', ['publish', '--access', 'public'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function printResult(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

const { name, version } = readPackageInfo();
console.log(`Package to publish: ${formatNpmPackageVersion(name, version)}`);

if (isPublished(name, version)) {
  console.log(`${formatNpmPackageVersion(name, version)} is already published.`);
  setOutput('published', 'true');
  setOutput('published_version', version);
  setOutput('already_published', 'true');
  process.exit(0);
}

const publishResult = publishPackage();
printResult(publishResult);

if (publishResult.status !== 0) {
  console.error(`npm publish failed with exit code ${publishResult.status}.`);
  process.exit(publishResult.status || 1);
}

if (!(await waitForPublishedVersion(name, version))) {
  console.error(`${formatNpmPackageVersion(name, version)} was not found on npm after publish.`);
  process.exit(1);
}

setOutput('published', 'true');
setOutput('published_version', version);
setOutput('already_published', 'false');
console.log(`Published ${formatNpmPackageVersion(name, version)} to npm.`);
