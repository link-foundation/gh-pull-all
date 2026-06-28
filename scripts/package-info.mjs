import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getPackageJsonPath } from './js-paths.mjs';

export function parsePackageInfo(packageJsonContent, packageJsonPath = 'package.json') {
  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error(`Could not parse ${packageJsonPath}: ${error.message}`);
  }

  if (typeof packageJson.name !== 'string' || packageJson.name.trim() === '') {
    throw new Error(`Package name is missing in ${packageJsonPath}`);
  }

  if (typeof packageJson.version !== 'string' || packageJson.version.trim() === '') {
    throw new Error(`Package version is missing in ${packageJsonPath}`);
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

export function readPackageInfo({ cwd = process.cwd(), jsRoot } = {}) {
  const packageJsonPath =
    jsRoot === undefined
      ? resolve(cwd, 'package.json')
      : resolve(cwd, getPackageJsonPath({ jsRoot }));
  return parsePackageInfo(readFileSync(packageJsonPath, 'utf8'), packageJsonPath);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getChangesetVersionTypeRegex(packageName, { requireQuotes = true } = {}) {
  const quotePattern = requireQuotes ? '[\'"]' : '[\'"]?';
  return new RegExp(
    `^${quotePattern}${escapeRegExp(packageName)}${quotePattern}:\\s+(major|minor|patch)\\s*$`,
    'm'
  );
}

export function formatChangesetHeader(packageName, bumpType) {
  return `'${packageName}': ${bumpType}`;
}

export function formatNpmPackageVersion(packageName, version) {
  return `${packageName}@${version}`;
}
