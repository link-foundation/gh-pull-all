#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function printUsage(write = console.error) {
  write('Usage: ./version.mjs <patch|minor|major>')
  write('Examples:')
  write('  ./version.mjs patch   # 1.0.3 → 1.0.4')
  write('  ./version.mjs minor   # 1.0.3 → 1.1.0')
  write('  ./version.mjs major   # 1.0.3 → 2.0.0')
}

const startupArgs = process.argv.slice(2)
if (startupArgs.includes('--help') || startupArgs.includes('-h')) {
  printUsage(console.log)
  process.exit(0)
}

// Download use-m dynamically (robustly, with CDN fallback and clear errors).
// See https://github.com/link-foundation/gh-pull-all/issues/35.
const { loadUseM } = await import('./load-use-m.mjs')
const { use } = await loadUseM()

// Import semver for version management
const semver = await use('semver@7.7.2')

function updatePackageJson(newVersion) {
  const packagePath = path.join(__dirname, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  packageJson.version = newVersion
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')
}

function updatePullAllMjs(newVersion) {
  const pullAllPath = path.join(__dirname, 'gh-pull-all.mjs')
  const content = fs.readFileSync(pullAllPath, 'utf8')
  const updatedContent = content.replace(
    /let version = '[^']+'/,
    `let version = '${newVersion}'`
  )
  fs.writeFileSync(pullAllPath, updatedContent)
}

function runGitCommand(command, description) {
  try {
    console.log(`🔄 ${description}...`)
    execSync(command, { stdio: 'inherit', cwd: __dirname })
    console.log(`✅ ${description} completed`)
  } catch (error) {
    console.error(`❌ Failed to ${description.toLowerCase()}: ${error.message}`)
    process.exit(1)
  }
}

async function main() {
  const versionType = process.argv[2]

  if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
    printUsage()
    process.exit(1)
  }

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', cwd: __dirname })
    if (status.trim()) {
      console.error('❌ Working directory is not clean. Please commit or stash your changes first.')
      console.error('\nUncommitted changes:')
      console.error(status)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Failed to check git status:', error.message)
    process.exit(1)
  }

  // Read current version from package.json
  const packagePath = path.join(__dirname, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const currentVersion = packageJson.version

  // Calculate new version using semver
  const newVersion = semver.inc(currentVersion, versionType)

  if (!newVersion) {
    console.error(`❌ Failed to calculate new ${versionType} version from ${currentVersion}`)
    process.exit(1)
  }

  console.log(`📦 Bumping version from ${currentVersion} to ${newVersion}`)

  try {
    // Update both files
    updatePackageJson(newVersion)
    updatePullAllMjs(newVersion)

    console.log('✅ Version updated successfully!')
    console.log(`   📄 package.json: ${newVersion}`)
    console.log(`   📄 gh-pull-all.mjs: ${newVersion}`)
    console.log('')

    const diffStatus = execSync('git status --porcelain', { encoding: 'utf8', cwd: __dirname })
    if (!diffStatus.trim()) {
      console.error('❌ No changes detected. Version may already be set to', newVersion)
      process.exit(1)
    }

    // Automatically commit and push only the versioned files.
    runGitCommand('git add package.json gh-pull-all.mjs', 'Adding version changes to git')
    runGitCommand(`git commit -m "${newVersion}"`, 'Committing changes')
    runGitCommand('git push', 'Pushing to remote repository')

    console.log('🎉 Version bump completed and pushed!')
  } catch (error) {
    console.error('❌ Error updating files:', error.message)
    process.exit(1)
  }
}

main().catch(console.error)
