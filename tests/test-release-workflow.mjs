#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, '..');

function read(relativePath) {
  return readFileSync(resolve(rootDir, relativePath), 'utf8');
}

function assertIncludesInOrder(content, first, second) {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);

  assert.notEqual(firstIndex, -1, `${first} should be present`);
  assert.notEqual(secondIndex, -1, `${second} should be present`);
  assert.ok(firstIndex < secondIndex, `${first} should appear before ${second}`);
}

const releaseWorkflowPath = resolve(rootDir, '.github/workflows/release.yml');
const publishWorkflowPath = resolve(rootDir, '.github/workflows/publish.yml');

assert.equal(existsSync(publishWorkflowPath), false, 'publish.yml should be replaced by release.yml');
assert.equal(existsSync(releaseWorkflowPath), true, 'release.yml should exist for npm trusted publishing');

const workflow = read('.github/workflows/release.yml');
assert.match(workflow, /^name: Checks and release/m);
assert.match(workflow, /^\s+pull_request:/m);
assert.match(workflow, /^\s+workflow_dispatch:/m);
assert.match(workflow, /branches:\s*\n\s+- main/);
assert.match(workflow, /^\s+detect-changes:/m);
assert.match(workflow, /run: node scripts\/detect-code-changes\.mjs/);
assert.match(workflow, /fetch-depth:\s*0/);
assert.match(workflow, /mjs-changed:\s*\$\{\{ steps\.changes\.outputs\.mjs-changed \}\}/);
assert.match(workflow, /shell-changed:\s*\$\{\{ steps\.changes\.outputs\.shell-changed \}\}/);
assert.match(workflow, /any-code-changed:\s*\$\{\{ steps\.changes\.outputs\.any-code-changed \}\}/);
assert.match(workflow, /^\s+version-check:/m);
assert.match(workflow, /^\s+changeset-check:/m);
assert.match(workflow, /^\s+needs: \[detect-changes, version-check, changeset-check\]/m);
assert.match(workflow, /always\(\) &&\n\s+!cancelled\(\)/);
assert.match(workflow, /needs\.detect-changes\.outputs\.any-code-changed == 'true'/);
assert.match(workflow, /needs\.detect-changes\.outputs\.workflow-changed == 'true'/);
assert.doesNotMatch(workflow, /needs\.detect-changes\.outputs\.docs-changed == 'true'/);
assert.match(workflow, /node scripts\/check-version\.mjs/);
assert.match(workflow, /node scripts\/validate-changeset\.mjs/);
assert.match(workflow, /node scripts\/check-changesets\.mjs/);
assert.match(workflow, /HAS_CHANGESETS:\s*\$\{\{ steps\.check_changesets\.outputs\.has_changesets \}\}/);
assert.match(workflow, /node scripts\/merge-changesets\.mjs/);
assert.match(workflow, /node scripts\/version-and-commit\.mjs --mode changeset/);
assert.match(workflow, /id-token:\s*write/);
assert.match(workflow, /contents:\s*write/);
assert.match(workflow, /node-version:\s*'24\.x'/);
assert.match(workflow, /registry-url:\s*'https:\/\/registry\.npmjs\.org'/);
assert.match(workflow, /node scripts\/setup-npm\.mjs/);
assert.match(workflow, /node scripts\/check-release-needed\.mjs/);
assert.match(workflow, /node scripts\/publish-to-npm\.mjs/);
assert.match(workflow, /node scripts\/smoke-test-package\.mjs/);
assert.match(workflow, /node scripts\/create-github-release\.mjs/);
assertIncludesInOrder(workflow, 'npm run test:ci', 'node scripts/publish-to-npm.mjs');

for (const script of [
  'scripts/check-file-line-limits.sh',
  'scripts/check-changesets.mjs',
  'scripts/check-mjs-syntax.sh',
  'scripts/check-release-needed.mjs',
  'scripts/check-version.mjs',
  'scripts/changeset-version.mjs',
  'scripts/create-github-release.mjs',
  'scripts/detect-code-changes.mjs',
  'scripts/js-paths.mjs',
  'scripts/merge-changesets.mjs',
  'scripts/package-info.mjs',
  'scripts/publish-to-npm.mjs',
  'scripts/setup-npm.mjs',
  'scripts/smoke-test-package.mjs',
  'scripts/validate-changeset.mjs',
  'scripts/version-and-commit.mjs',
]) {
  assert.equal(existsSync(resolve(rootDir, script)), true, `${script} should exist`);
}

const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.publishConfig?.access, 'public');
assert.match(packageJson.engines?.node, />=20\./);
assert.equal(packageJson.scripts['check:syntax'], 'bash scripts/check-mjs-syntax.sh');
assert.equal(packageJson.scripts['check:line-limits'], 'bash scripts/check-file-line-limits.sh');
assert.equal(packageJson.scripts['check:changeset'], 'node scripts/validate-changeset.mjs');
assert.equal(packageJson.scripts['changeset:version'], 'node scripts/changeset-version.mjs');
assert.equal(packageJson.devDependencies?.['@changesets/cli'], '^2.29.7');
assert.equal(packageJson.scripts['test:ci'], 'node tests/test-all.mjs');
assert.ok(packageJson.files.includes('status-display.mjs'), 'published package should include status display module');

assert.equal(existsSync(resolve(rootDir, '.changeset/config.json')), true, 'changeset config should exist');
assert.equal(existsSync(resolve(rootDir, '.changeset/default-auto-mode.md')), true, 'feature changeset should exist');

const readme = read('README.md');
assert.match(readme, /actions\/workflows\/release\.yml\/badge\.svg/);
assert.match(readme, /img\.shields\.io\/github\/v\/release\/link-foundation\/gh-pull-all/);

console.log('Release workflow configuration is valid.');
