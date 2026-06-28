#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getChangesetDir, getJsRoot, parseJsRootConfig } from './js-paths.mjs';
import { formatChangesetHeader, getChangesetVersionTypeRegex, readPackageInfo } from './package-info.mjs';

const bumpPriority = { patch: 1, minor: 2, major: 3 };

function parseChangeset(filePath, packageName) {
  const content = readFileSync(filePath, 'utf8');
  const versionTypeRegex = getChangesetVersionTypeRegex(packageName, { requireQuotes: false });
  const match = content.match(versionTypeRegex);
  if (!match) {
    throw new Error(`Could not parse changeset bump type in ${filePath}.`);
  }

  const parts = content.split('---');
  return {
    type: match[1],
    description: parts.length >= 3 ? parts.slice(2).join('---').trim() : '',
    mtime: statSync(filePath).mtime,
  };
}

function highestBump(types) {
  return types.reduce((highest, type) => (
    bumpPriority[type] > bumpPriority[highest] ? type : highest
  ), 'patch');
}

const jsRoot = getJsRoot({ jsRoot: parseJsRootConfig(), verbose: true });
const changesetDir = getChangesetDir({ jsRoot });
const { name: packageName } = readPackageInfo({ jsRoot });
const changesetFiles = readdirSync(changesetDir).filter((file) => file.endsWith('.md') && file !== 'README.md');

if (changesetFiles.length <= 1) {
  console.log('No changeset merge needed.');
  process.exit(0);
}

const parsed = changesetFiles
  .map((file) => ({ file, filePath: join(changesetDir, file), ...parseChangeset(join(changesetDir, file), packageName) }))
  .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

const bumpType = highestBump(parsed.map((changeset) => changeset.type));
const descriptions = parsed.map((changeset) => changeset.description).filter(Boolean);
const mergedName = `merged-${Date.now().toString(36)}.md`;
const mergedPath = join(changesetDir, mergedName);
const mergedContent = `---
${formatChangesetHeader(packageName, bumpType)}
---

${descriptions.join('\n\n')}
`;

writeFileSync(mergedPath, mergedContent);
parsed.forEach((changeset) => unlinkSync(changeset.filePath));

console.log(`Merged ${parsed.length} changesets into ${mergedName}.`);
