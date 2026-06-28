#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join } from 'node:path';

let cachedJsRoot = null;

export function getJsRoot({ jsRoot, verbose = false } = {}) {
  if (jsRoot) {
    if (verbose) {
      console.log(`Using explicitly configured JavaScript root: ${jsRoot}`);
    }
    return jsRoot;
  }

  if (cachedJsRoot !== null) {
    return cachedJsRoot;
  }

  if (existsSync('./package.json')) {
    if (verbose) {
      console.log('Detected JavaScript package at repository root.');
    }
    cachedJsRoot = '.';
    return cachedJsRoot;
  }

  if (existsSync('./js/package.json')) {
    if (verbose) {
      console.log('Detected JavaScript package under js/.');
    }
    cachedJsRoot = 'js';
    return cachedJsRoot;
  }

  throw new Error('Could not find package.json at repository root or under js/.');
}

export function getPackageJsonPath(options = {}) {
  const jsRoot = options.jsRoot !== undefined ? options.jsRoot : getJsRoot(options);
  return jsRoot === '.' ? './package.json' : join(jsRoot, 'package.json');
}

export function getPackageLockPath(options = {}) {
  const jsRoot = options.jsRoot !== undefined ? options.jsRoot : getJsRoot(options);
  return jsRoot === '.' ? './package-lock.json' : join(jsRoot, 'package-lock.json');
}

export function getChangesetDir(options = {}) {
  const jsRoot = options.jsRoot !== undefined ? options.jsRoot : getJsRoot(options);
  return jsRoot === '.' ? './.changeset' : join(jsRoot, '.changeset');
}

export function needsCd(options = {}) {
  const jsRoot = options.jsRoot !== undefined ? options.jsRoot : getJsRoot(options);
  return jsRoot !== '.';
}

export function parseJsRootConfig() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--js-root');
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return process.env.JS_ROOT || undefined;
}

export function resetCache() {
  cachedJsRoot = null;
}
