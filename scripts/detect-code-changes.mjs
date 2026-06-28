#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function runGit(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', options.allowFailure ? 'pipe' : 'inherit'],
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return '';
    }

    throw error;
  }
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }

  console.log(`${name}=${value}`);
}

function isPullRequestEvent() {
  return process.env.GITHUB_EVENT_NAME === 'pull_request';
}

function getParentRefs() {
  const refs = runGit(['rev-list', '--parents', '-n', '1', 'HEAD']);
  return refs.split(/\s+/).slice(1);
}

function getDiffFiles(fromRef, toRef) {
  const output = runGit(['diff', '--name-only', fromRef, toRef], {
    allowFailure: true,
  });
  return output ? output.split('\n').filter(Boolean) : [];
}

function listFilesInHead() {
  const output = runGit(['ls-tree', '--name-only', '-r', 'HEAD']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function getChangedFiles() {
  const parents = getParentRefs();
  const isMergeCommit = parents.length > 1;

  if (isPullRequestEvent() && isMergeCommit) {
    console.log('Pull request merge commit detected.');

    if (runGit(['rev-parse', '--verify', 'HEAD^2^'], { allowFailure: true })) {
      console.log('Comparing HEAD^2^ to HEAD^2 for latest PR head commit.');
      return getDiffFiles('HEAD^2^', 'HEAD^2');
    }

    console.log('First PR commit detected; comparing HEAD^ to HEAD^2.');
    return getDiffFiles('HEAD^', 'HEAD^2');
  }

  if (parents.length > 0) {
    console.log('Comparing HEAD^1 to HEAD.');
    return getDiffFiles('HEAD^1', 'HEAD');
  }

  console.log('No parent commit detected; listing all files in HEAD.');
  return listFilesInHead();
}

function isExcludedFromCodeChanges(filePath) {
  if (filePath.endsWith('.md')) {
    return true;
  }

  return ['.changeset/', 'docs/', 'experiments/', 'examples/'].some((folder) =>
    filePath.startsWith(folder)
  );
}

function detectChanges() {
  console.log('Detecting file changes for CI/CD.\n');

  const changedFiles = getChangedFiles();

  console.log('Changed files:');
  if (changedFiles.length === 0) {
    console.log('  (none)');
  } else {
    changedFiles.forEach((file) => console.log(`  ${file}`));
  }
  console.log('');

  const mjsChanged = changedFiles.some((file) => file.endsWith('.mjs'));
  setOutput('mjs-changed', mjsChanged ? 'true' : 'false');

  const shellChanged = changedFiles.some((file) => file.endsWith('.sh'));
  setOutput('shell-changed', shellChanged ? 'true' : 'false');

  const packageChanged = changedFiles.some((file) =>
    ['package.json', 'package-lock.json'].includes(file)
  );
  setOutput('package-changed', packageChanged ? 'true' : 'false');

  const docsChanged = changedFiles.some((file) => file.endsWith('.md'));
  setOutput('docs-changed', docsChanged ? 'true' : 'false');

  const workflowChanged = changedFiles.some((file) =>
    file.startsWith('.github/workflows/')
  );
  setOutput('workflow-changed', workflowChanged ? 'true' : 'false');

  const codeChangedFiles = changedFiles.filter(
    (file) => !isExcludedFromCodeChanges(file)
  );

  console.log('\nFiles considered as code changes:');
  if (codeChangedFiles.length === 0) {
    console.log('  (none)');
  } else {
    codeChangedFiles.forEach((file) => console.log(`  ${file}`));
  }
  console.log('');

  const codePattern = /\.(mjs|cjs|js|json|sh|yml|yaml)$|^\.github\/workflows\//;
  const anyCodeChanged = codeChangedFiles.some((file) =>
    codePattern.test(file)
  );
  setOutput('any-code-changed', anyCodeChanged ? 'true' : 'false');

  console.log('\nChange detection completed.');
}

detectChanges();
