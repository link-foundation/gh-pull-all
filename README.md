# pull-all

[![Open in Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-f29718?style=flat-square&logo=gitpod)](https://gitpod.io/#https://github.com/konard/pull-all)
[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?style=flat-square&logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=konard/pull-all)

The script that pulls it all - efficiently sync all repositories from a GitHub organization or user account with parallel processing and real-time status updates.

## Features

- 🚀 **Parallel Processing**: Configure concurrent operations with `--threads` option (default: 8)
- 📊 **Real-time Status**: In-place updating display shows progress for each repository
- 🔄 **Smart Updates**: Automatically pulls existing repos and clones new ones
- 🔐 **SSH Support**: Use SSH URLs for cloning with `--ssh` flag
- ⚡ **Flexible Threading**: Use `--single-thread` for sequential processing or customize with `--threads N`
- 🎯 **Comprehensive**: Works with both organizations and user accounts
- 🛡️ **Error Handling**: Graceful handling of rate limits, authentication, and network issues

## Quick Start

```bash
# Clone all repositories from a user account
./pull-all.mjs --user octocat

# Clone all repositories from an organization
./pull-all.mjs --org github

# Use SSH for cloning with custom thread count
./pull-all.mjs --user octocat --ssh --threads 16

# Sequential processing for debugging
./pull-all.mjs --org myorg --single-thread
```

## Installation

```bash
# Clone the repository
git clone https://github.com/konard/pull-all.git
cd pull-all

# Make the script executable
chmod +x pull-all.mjs

# Run it
./pull-all.mjs --help
```

## Usage

```
Usage: pull-all.mjs [--org <organization> | --user <username>] [options]

Options:
  -o, --org            GitHub organization name
  -u, --user           GitHub username  
  -t, --token          GitHub personal access token (optional for public repos)
  -s, --ssh            Use SSH URLs for cloning (requires SSH key setup)
  -d, --dir            Target directory for repositories (default: current directory)
  -j, --threads        Number of concurrent operations (default: 8)
      --single-thread  Run operations sequentially (equivalent to --threads 1)
  -h, --help           Show help
```

## Examples

```bash
# Basic usage - sync all public repos from a user
./pull-all.mjs --user octocat

# Sync organization repos with authentication
./pull-all.mjs --org github --token ghp_your_token_here

# Use SSH for cloning (faster for multiple repos)
./pull-all.mjs --user octocat --ssh

# Custom directory and thread count
./pull-all.mjs --org myorg --dir ./repositories --threads 16

# Single-threaded for debugging or rate limit issues
./pull-all.mjs --user octocat --single-thread

# Maximum concurrency (be careful with rate limits)
./pull-all.mjs --org myorg --threads 20 --token $GITHUB_TOKEN
```

## Status Display

The script shows real-time progress with visual indicators:

- ⏳ `pending` - Repository queued for processing
- 📦 `cloning` - Currently cloning repository  
- 📥 `pulling` - Currently pulling updates
- ✅ `success` - Operation completed successfully
- ❌ `failed` - Operation failed (see error message)
- ⚠️ `skipped` - Repository skipped (e.g., private repo without token)
- 🔄 `uncommitted` - Has uncommitted changes, pull skipped

## Requirements

- [Bun](https://bun.sh/) runtime
- Git installed and configured
- GitHub personal access token (for private repos or higher rate limits)
- SSH keys configured (if using `--ssh` option)

## Testing

The project includes a comprehensive test suite:

```bash
# Run all tests
./test-all.mjs

# Run specific test categories
./test-cli-simple.mjs      # CLI validation tests
./test-github-api.mjs      # GitHub API integration tests  
./test-file-operations.mjs # File system and git operations
./test-threading.mjs       # Thread configuration tests
./test-parallel.mjs        # Parallel processing tests
./test-integration.mjs     # End-to-end integration tests
```

## Rate Limits

- **Unauthenticated**: 60 requests per hour
- **Authenticated**: 5,000 requests per hour
- Use `--token` for better rate limits and access to private repositories
- Use `--threads 1` or `--single-thread` if hitting rate limits

## License

This project is released into the public domain under The Unlicense - see [LICENSE](LICENSE) file for details.
