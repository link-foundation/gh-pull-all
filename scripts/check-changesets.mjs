#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getChangesetDir, getJsRoot, parseJsRootConfig } from './js-paths.mjs';
import { getChangesetVersionTypeRegex, readPackageInfo } from './package-info.mjs';

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

function hasValidFrontmatter(filePath, versionTypeRegex) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    return frontmatter !== null && versionTypeRegex.test(frontmatter[1]);
  } catch (error) {
    console.warn(`Warning: failed to read ${filePath}: ${error.message}`);
    return false;
  }
}

function countChangesets(changesetDir, packageName) {
  if (!existsSync(changesetDir)) {
    return 0;
  }

  const versionTypeRegex = getChangesetVersionTypeRegex(packageName, { requireQuotes: false });
  return readdirSync(changesetDir).filter((file) => {
    if (!file.endsWith('.md') || file === 'README.md') {
      return false;
    }
    return hasValidFrontmatter(join(changesetDir, file), versionTypeRegex);
  }).length;
}

const jsRoot = getJsRoot({ jsRoot: parseJsRootConfig(), verbose: true });
const changesetDir = getChangesetDir({ jsRoot });
const { name: packageName } = readPackageInfo({ jsRoot });
const changesetCount = countChangesets(changesetDir, packageName);

console.log(`Package: ${packageName}`);
console.log(`Changeset directory: ${changesetDir}`);
console.log(`Found ${changesetCount} changeset file(s).`);

setOutput('has_changesets', changesetCount > 0 ? 'true' : 'false');
setOutput('changeset_count', String(changesetCount));
