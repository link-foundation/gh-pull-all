#!/usr/bin/env bun

// Auto mode functionality test
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
const fs = await use('fs-extra@11.3.0')
const path = await use('path@0.12.7')
const { promises: nodeFs } = await use('fs@2.0.3')

// Mock helper functions
function validateArgs(args) {
  const hasOrg = args.includes('--org') || args.includes('-o')
  const hasUser = args.includes('--user') || args.includes('-u')
  const hasAuto = args.includes('--auto') || args.includes('-a')
  
  if (!hasOrg && !hasUser && !hasAuto) {
    throw new Error('You must specify either --org, --user, or --auto')
  }
  
  if ((hasOrg && hasUser) || (hasOrg && hasAuto) || (hasUser && hasAuto)) {
    throw new Error('You can only specify one of --org, --user, or --auto')
  }
  
  return true
}

async function getPreferencesPath(targetDir) {
  return path.join(targetDir, '.gh-pull-all', 'preferences.json')
}

async function loadPreferences(targetDir) {
  try {
    const preferencesPath = await getPreferencesPath(targetDir)
    if (await fs.pathExists(preferencesPath)) {
      const data = await nodeFs.readFile(preferencesPath, 'utf8')
      const preferences = JSON.parse(data)
      return preferences
    }
  } catch (error) {
    // Ignore errors when loading preferences
  }
  return {}
}

async function savePreferences(targetDir, preferences) {
  const preferencesPath = await getPreferencesPath(targetDir)
  await fs.ensureDir(path.dirname(preferencesPath))
  await nodeFs.writeFile(preferencesPath, JSON.stringify(preferences, null, 2))
}

async function detectFromFolderName(targetDir) {
  const parentDir = path.basename(path.resolve(targetDir, '..'))
  const currentDir = path.basename(targetDir)
  
  const candidateName = currentDir.match(/^[a-zA-Z0-9-._]+$/) && currentDir !== '.' ? currentDir : parentDir
  
  if (candidateName && candidateName.match(/^[a-zA-Z0-9-._]+$/) && candidateName !== '.') {
    return candidateName
  }
  
  return null
}

async function autoDetectTarget(targetDir, preferences) {
  if (preferences.org) {
    return { org: preferences.org, user: null }
  }
  
  if (preferences.user) {
    return { org: null, user: preferences.user }
  }
  
  const detected = await detectFromFolderName(targetDir)
  if (detected) {
    return { org: null, user: detected, autoDetected: true }
  }
  
  throw new Error('Unable to auto-detect user/org. Please specify --org or --user explicitly, or run from a folder with a recognizable name.')
}

// Tests
test('auto mode validates correctly in CLI args', () => {
  assert.ok(validateArgs(['--auto']))
  assert.ok(validateArgs(['-a']))
  
  assert.throws(() => validateArgs(['--auto', '--org', 'test']))
  assert.throws(() => validateArgs(['--auto', '--user', 'test']))
  assert.throws(() => validateArgs(['--org', 'test', '--user', 'test']))
  assert.throws(() => validateArgs([]))
})

test('preferences can be saved and loaded', async () => {
  const testDir = path.join(process.cwd(), 'test-temp-auto', Math.random().toString(36).slice(2))
  
  try {
    // Clean up any existing preferences
    await fs.remove(testDir)
    
    // Save preferences
    const prefs = { user: 'testuser' }
    await savePreferences(testDir, prefs)
    
    // Load preferences
    const loaded = await loadPreferences(testDir)
    assert.equal(loaded.user, 'testuser')
    
    // Test with org preferences
    const orgPrefs = { org: 'testorg' }
    await savePreferences(testDir, orgPrefs)
    const loadedOrg = await loadPreferences(testDir)
    assert.equal(loadedOrg.org, 'testorg')
    
  } finally {
    await fs.remove(testDir).catch(() => {})
  }
})

test('folder name detection works', async () => {
  const testBaseDir = path.join(process.cwd(), 'test-temp-detect', Math.random().toString(36).slice(2))
  
  try {
    // Test with user-like folder name
    const userDir = path.join(testBaseDir, 'konard')
    await fs.ensureDir(userDir)
    
    const detected1 = await detectFromFolderName(userDir)
    assert.equal(detected1, 'konard')
    
    // Test with org-like folder name  
    const orgDir = path.join(testBaseDir, 'deep-assistant')
    await fs.ensureDir(orgDir)
    
    const detected2 = await detectFromFolderName(orgDir)
    assert.equal(detected2, 'deep-assistant')
    
    // Test with invalid folder name
    const invalidDir = path.join(testBaseDir, 'invalid name with spaces')
    await fs.ensureDir(invalidDir)
    
    const detected3 = await detectFromFolderName(invalidDir)
    assert.equal(detected3, path.basename(testBaseDir))
    
  } finally {
    await fs.remove(testBaseDir).catch(() => {})
  }
})

test('auto-detect target uses preferences first', async () => {
  const testDir = path.join(process.cwd(), 'test-temp-target', Math.random().toString(36).slice(2))
  
  try {
    // Test with saved user preference
    const prefs = { user: 'saveduser' }
    await savePreferences(testDir, prefs)
    
    const result1 = await autoDetectTarget(testDir, prefs)
    assert.equal(result1.user, 'saveduser')
    assert.equal(result1.org, null)
    
    // Test with saved org preference
    const orgPrefs = { org: 'savedorg' }
    const result2 = await autoDetectTarget(testDir, orgPrefs)
    assert.equal(result2.org, 'savedorg')
    assert.equal(result2.user, null)
    
  } finally {
    await fs.remove(testDir).catch(() => {})
  }
})

test('auto-detect falls back to folder detection', async () => {
  const testBaseDir = path.join(process.cwd(), 'test-temp-fallback', Math.random().toString(36).slice(2))
  
  try {
    const userDir = path.join(testBaseDir, 'detected-user')
    await fs.ensureDir(userDir)
    
    const result = await autoDetectTarget(userDir, {})
    assert.equal(result.user, 'detected-user')
    assert.equal(result.org, null)
    assert.equal(result.autoDetected, true)
    
  } finally {
    await fs.remove(testBaseDir).catch(() => {})
  }
})

test('auto-detect throws error when no detection possible', async () => {
  const baseDir = path.join(process.cwd(), 'invalid parent name')
  const testDir = path.join(baseDir, 'invalid child name')
  
  try {
    await fs.ensureDir(testDir)
    
    try {
      await autoDetectTarget(testDir, {})
      assert.unreachable('Expected error to be thrown')
    } catch (error) {
      assert.match(error.message, /Unable to auto-detect/)
    }
    
  } finally {
    await fs.remove(baseDir).catch(() => {})
  }
})

test.run()