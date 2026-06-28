#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { getJsRoot, getPackageJsonPath, parseJsRootConfig } from './js-paths.mjs';

function run(command, args) {
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
  });
}

function syncCliFallbackVersion(version) {
  const cliPath = 'gh-pull-all.mjs';
  const source = readFileSync(cliPath, 'utf8');
  const updated = source.replace(/let version = '[^']+' \/\/ Fallback version/, `let version = '${version}' // Fallback version`);

  if (updated === source) {
    throw new Error(`Could not update fallback version in ${cliPath}.`);
  }

  writeFileSync(cliPath, updated);
}

const jsRoot = getJsRoot({ jsRoot: parseJsRootConfig(), verbose: true });
const packageJsonPath = getPackageJsonPath({ jsRoot });

console.log('Running changeset version.');
run('npx', ['changeset', 'version']);

console.log('Synchronizing package-lock.json.');
run('npm', ['install', '--package-lock-only']);

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
syncCliFallbackVersion(packageJson.version);

console.log(`Version files synchronized at ${packageJson.version}.`);
