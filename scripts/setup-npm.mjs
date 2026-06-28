#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';

export const NODE_MIN_VERSION = '22.14.0';
export const NPM_MIN_VERSION = '11.5.1';

export function parseVersion(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?/);

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

export function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] > right[key] ? 1 : -1;
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }

  if (!left.prerelease) {
    return 1;
  }

  if (!right.prerelease) {
    return -1;
  }

  return left.prerelease > right.prerelease ? 1 : -1;
}

export function isVersionAtLeast(version, minimumVersion) {
  return compareVersions(version, minimumVersion) >= 0;
}

function readCommand(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function installNpm11() {
  const result = spawnSync('npm', ['install', '-g', 'npm@11'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail('Failed to install npm@11, which is required for npm trusted publishing.');
  }
}

const nodeVersion = process.version;
console.log(`Current Node.js version: ${nodeVersion}`);

if (!isVersionAtLeast(nodeVersion, NODE_MIN_VERSION)) {
  fail(`Node.js ${NODE_MIN_VERSION} or later is required for npm trusted publishing.`);
}

const initialNpmVersion = readCommand('npm', ['--version']);
console.log(`Current npm version: ${initialNpmVersion}`);

if (!isVersionAtLeast(initialNpmVersion, NPM_MIN_VERSION)) {
  console.log(`Updating npm to npm@11 for OIDC trusted publishing...`);
  installNpm11();
}

const finalNpmVersion = readCommand('npm', ['--version']);
console.log(`Final npm version: ${finalNpmVersion}`);

if (!isVersionAtLeast(finalNpmVersion, NPM_MIN_VERSION)) {
  fail(`npm ${NPM_MIN_VERSION} or later is required for npm trusted publishing.`);
}
