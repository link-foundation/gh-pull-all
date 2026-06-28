#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const options = { mode: 'changeset', bumpType: '', description: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      options.mode = argv[++i] || '';
    } else if (arg === '--bump-type') {
      options.bumpType = argv[++i] || '';
    } else if (arg === '--description') {
      options.description = argv[++i] || '';
    }
  }
  return options;
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'] : 'inherit',
    }).trim();
  } catch (error) {
    if (allowFailure) {
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

function readVersion(ref = '') {
  if (ref) {
    const content = run('git', ['show', `${ref}:package.json`], { capture: true });
    return JSON.parse(content).version;
  }
  return JSON.parse(readFileSync('package.json', 'utf8')).version;
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

function countChangesets() {
  const output = run('git', ['ls-files', '.changeset/*.md'], { capture: true, allowFailure: true });
  return output
    .split('\n')
    .filter((file) => file && !file.endsWith('/README.md'))
    .length;
}

async function main() {
  const { mode, bumpType } = parseArgs(process.argv.slice(2));
  if (!['changeset', 'instant'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
  if (mode === 'instant' && !['major', 'minor', 'patch'].includes(bumpType)) {
    throw new Error('--bump-type must be major, minor, or patch for instant mode.');
  }

  run('git', ['config', 'user.name', 'github-actions[bot]']);
  run('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  run('git', ['fetch', 'origin', 'main']);

  const localHead = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const remoteHead = run('git', ['rev-parse', 'origin/main'], { capture: true });
  if (localHead !== remoteHead) {
    if (countChangesets() === 0) {
      const remoteVersion = readVersion('origin/main');
      setOutput('version_committed', 'false');
      setOutput('already_released', 'true');
      setOutput('new_version', remoteVersion);
      return;
    }
    run('git', ['rebase', 'origin/main']);
  }

  const oldVersion = readVersion();
  console.log(`Current version: ${oldVersion}`);

  if (mode === 'changeset') {
    run('npm', ['run', 'changeset:version']);
  } else {
    run('npm', ['version', bumpType, '--no-git-tag-version']);
    syncCliFallbackVersion(readVersion());
  }

  const newVersion = readVersion();
  setOutput('new_version', newVersion);

  const status = run('git', ['status', '--porcelain'], { capture: true });
  if (!status) {
    setOutput('version_committed', 'false');
    setOutput('already_released', 'false');
    return;
  }

  run('git', ['add', '-A']);
  run('git', ['commit', '-m', newVersion]);
  run('git', ['push', 'origin', 'main']);
  setOutput('version_committed', 'true');
  setOutput('already_released', 'false');
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});
