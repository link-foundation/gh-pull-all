#!/usr/bin/env sh
':' //# ; exec "$(command -v bun || command -v node)" "$0" "$@"

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import semver for version management
const semver = await use('semver@7.7.2')

function updatePackageJson(newVersion) {
  const packagePath = path.join(__dirname, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  packageJson.version = newVersion
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')
}

function updatePullAllMjs(newVersion) {
  const pullAllPath = path.join(__dirname, 'pull-all.mjs')
  const content = fs.readFileSync(pullAllPath, 'utf8')
  const updatedContent = content.replace(
    /let version = '[^']+'/,
    `let version = '${newVersion}'`
  )
  fs.writeFileSync(pullAllPath, updatedContent)
}

async function main() {
  const versionType = process.argv[2]
  
  if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
    console.error('Usage: ./version.mjs <patch|minor|major>')
    console.error('Examples:')
    console.error('  ./version.mjs patch   # 1.0.3 → 1.0.4')
    console.error('  ./version.mjs minor   # 1.0.3 → 1.1.0')
    console.error('  ./version.mjs major   # 1.0.3 → 2.0.0')
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
    console.log(`   📄 pull-all.mjs: ${newVersion}`)
    console.log('')
    console.log('🚀 Next steps:')
    console.log('   git add .')
    console.log(`   git commit -m "Bump version to ${newVersion}"`)
    console.log('   git push')
  } catch (error) {
    console.error('❌ Error updating files:', error.message)
    process.exit(1)
  }
}

main().catch(console.error)