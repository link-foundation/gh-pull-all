#!/usr/bin/env bun

// Test file system and git operations
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const { test } = await use('uvu@0.5.6')
const assert = await use('uvu@0.5.6/assert')
import { promises as fs } from 'fs'
import path from 'path'
const { default: git } = await use('simple-git@latest')

// Test file system functions by creating them here
async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function pullRepository(repoName, targetDir) {
  try {
    const log = (color, message) => {} // Mock log function
    log('yellow', `📥 Pulling ${repoName}...`)
    const repoPath = path.join(targetDir, repoName)
    const simpleGit = git(repoPath)
    
    const status = await simpleGit.status()
    if (status.files.length > 0) {
      log('cyan', `⚠️  ${repoName} has uncommitted changes, skipping pull`)
      return true
    }
    
    await simpleGit.pull()
    log('green', `✅ Successfully pulled ${repoName}`)
    return true
  } catch (error) {
    return false
  }
}

async function cloneRepository(repo, targetDir, useSsh) {
  try {
    const log = (color, message) => {} // Mock log function
    log('yellow', `📦 Cloning ${repo.name}...`)
    const simpleGit = git(targetDir)
    
    const cloneUrl = useSsh && repo.ssh_url ? repo.ssh_url : repo.clone_url
    await simpleGit.clone(cloneUrl, repo.name)
    
    log('green', `✅ Successfully cloned ${repo.name}`)
    return true
  } catch (error) {
    return false
  }
}

const testDir = path.join(process.cwd(), 'test-temp')

test.before(async () => {
  // Ensure test directory exists
  await fs.mkdir(testDir, {recursive: true})
})

test.after(async () => {
  // Clean up test directory
  await fs.rm(testDir, {recursive: true, force: true})
})

test('directoryExists should return true for existing directory', async () => {
  const exists = await directoryExists(testDir)
  assert.ok(exists, 'Should return true for existing directory')
})

test('directoryExists should return false for non-existing directory', async () => {
  const nonExistentDir = path.join(testDir, 'non-existent')
  const exists = await directoryExists(nonExistentDir)
  assert.not.ok(exists, 'Should return false for non-existing directory')
})

test('directoryExists should return false for file path', async () => {
  const filePath = path.join(testDir, 'test-file.txt')
  await fs.writeFile(filePath, 'test content')
  
  const exists = await directoryExists(filePath)
  assert.not.ok(exists, 'Should return false for file path')
  
  await fs.rm(filePath, {recursive: true, force: true})
})

test('cloneRepository should clone a public repository', async () => {
  const mockRepo = {
    name: 'Hello-World',
    clone_url: 'https://github.com/octocat/Hello-World.git',
    ssh_url: 'git@github.com:octocat/Hello-World.git'
  }
  
  const success = await cloneRepository(mockRepo, testDir, false)
  assert.ok(success, 'Should successfully clone repository')
  
  const repoPath = path.join(testDir, mockRepo.name)
  const exists = await directoryExists(repoPath)
  assert.ok(exists, 'Cloned repository directory should exist')
  
  // Clean up cloned repository
  await fs.rm(repoPath, {recursive: true, force: true})
})

test('cloneRepository should handle invalid repository URL', async () => {
  const mockRepo = {
    name: 'invalid-repo',
    clone_url: 'https://github.com/nonexistent/invalid-repo.git',
    ssh_url: 'git@github.com:nonexistent/invalid-repo.git'
  }
  
  const success = await cloneRepository(mockRepo, testDir, false)
  assert.not.ok(success, 'Should return false for invalid repository')
})

test('pullRepository should handle non-existent directory', async () => {
  // Test with a directory that doesn't exist
  const success = await pullRepository('non-existent-repo', testDir)
  assert.not.ok(success, 'Should return false for non-existent directory')
})

test.run()