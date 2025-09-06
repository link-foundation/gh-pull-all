[![npm version](https://img.shields.io/npm/v/gh-pull-all)](https://www.npmjs.com/package/gh-pull-all)
[![Open in Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-f29718?logo=gitpod)](https://gitpod.io/#https://github.com/link-foundation/gh-pull-all)
[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=link-foundation/gh-pull-all)

# gh-pull-all

The script that pulls it all - efficiently sync all repositories from a GitHub organization or user account with parallel processing and real-time status updates.

## Features

- 🚀 **Parallel Processing**: Configure concurrent operations with `--threads` option (default: 8)
- 📊 **Real-time Status**: In-place updating display shows progress for each repository
- 🔄 **Smart Updates**: Automatically pulls existing repos and clones new ones
- 🍴 **Fork Sync**: Automatically sync forked repositories with their upstream (parent) repositories using `--pull-changes-to-fork`
- 🔐 **SSH Support**: Use SSH URLs for cloning with `--ssh` flag
- ⚡ **Flexible Threading**: Use `--single-thread` for sequential processing or customize with `--threads N`
- 🎯 **Comprehensive**: Works with both organizations and user accounts
- 🔑 **Smart Authentication**: Automatic GitHub CLI integration for seamless private repo access
- 🛡️ **Error Handling**: Graceful handling of rate limits, authentication, and network issues
- 📈 **Visual Progress Bar**: Color-coded progress bar shows real-time status (green=success, red=failed, yellow=skipped, cyan=active, gray=pending)
- 🖥️ **Smart Terminal Display**: Windowed display mode automatically adjusts to terminal height for large repo counts
- 🔍 **Uncommitted Changes Detection**: Automatically detects and skips repositories with uncommitted changes
- 📋 **Error Summary**: Numbered error tracking with detailed error list at completion
- ⚡ **Smooth Updates**: 10 FPS render loop for fluid terminal animations in multi-thread mode

## Quick Start

```bash
# Clone all repositories from a user account
gh-pull-all --user octocat

# Clone all repositories from an organization
gh-pull-all --org github

# Use SSH for cloning with custom thread count
gh-pull-all --user octocat --ssh --threads 16

# Sequential processing for debugging
gh-pull-all --org myorg --single-thread
```

## Installation

### Global Installation (Recommended)

Install globally for system-wide access:

```bash
# Using bun
bun install -g gh-pull-all

# Using npm
npm install -g gh-pull-all

# After installation, use anywhere:
gh-pull-all --help
```

### Uninstall

Remove the global installation:

```bash
# Using bun
bun uninstall -g gh-pull-all

# Using npm
npm uninstall -g gh-pull-all
```

### Local Installation

```bash
# Clone the repository
git clone https://github.com/link-foundation/gh-pull-all.git
cd gh-pull-all

# Make the script executable
chmod +x gh-pull-all.mjs

# Run it
./gh-pull-all.mjs --help
```

## Usage

```
Usage: gh-pull-all [--org <organization> | --user <username>] [options]

Options:
  -o, --org            GitHub organization name
  -u, --user           GitHub username  
  -t, --token          GitHub personal access token (optional for public repos)
  -s, --ssh            Use SSH URLs for cloning (requires SSH key setup)
  -d, --dir            Target directory for repositories (default: current directory)
  -j, --threads        Number of concurrent operations (default: 8)
      --single-thread  Run operations sequentially (equivalent to --threads 1)
      --live-updates   Enable live in-place status updates (default: true)
      --no-live-updates Disable live updates for terminal history preservation
  -h, --help           Show help
```

## Authentication

The script supports multiple authentication methods for accessing private repositories:

### 1. GitHub CLI (Recommended)
If you have [GitHub CLI](https://cli.github.com/) installed and authenticated, the script will automatically use your credentials:

```bash
# Authenticate with GitHub CLI (one-time setup)
gh auth login

# Script automatically detects and uses gh CLI authentication
gh-pull-all --org myorg  # Includes private repos!
```

### 2. Environment Variable
Set the `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN=ghp_your_token_here
gh-pull-all --org myorg
```

### 3. Command Line Token
Pass the token directly with `--token`:

```bash
gh-pull-all --org myorg --token ghp_your_token_here
```

### Authentication Priority
The script uses this fallback chain:
1. `--token` command line argument (highest priority)
2. `GITHUB_TOKEN` environment variable
3. GitHub CLI authentication (if `gh` is installed and authenticated)
4. No authentication (public repos only)

## Examples

```bash
# Basic usage - sync all public repos from a user
gh-pull-all --user octocat

# Sync all repos (including private) using GitHub CLI auth
gh-pull-all --org myorg  # Automatically uses gh CLI if authenticated

# Sync organization repos with environment token
export GITHUB_TOKEN=ghp_your_token_here
gh-pull-all --org myorg

# Sync with explicit token
gh-pull-all --org github --token ghp_your_token_here

# Use SSH for cloning (faster for multiple repos)
gh-pull-all --user octocat --ssh

# Custom directory and thread count
gh-pull-all --org myorg --dir ./repositories --threads 16

# Single-threaded for debugging or rate limit issues
gh-pull-all --user octocat --single-thread

# Maximum concurrency (be careful with rate limits)
gh-pull-all --org myorg --threads 20

# Disable live updates for terminal history preservation
gh-pull-all --user octocat --no-live-updates

# Sync forked repositories with their upstream (parent) repositories
gh-pull-all --user your-username --pull-changes-to-fork

# Only process forks and sync with SSH
gh-pull-all --user your-username --pull-changes-to-fork --ssh
```

## Status Display

The script shows real-time progress with visual indicators. By default, it uses live in-place updates for a dynamic experience. Use `--no-live-updates` to disable in-place updates if you need to preserve terminal history.

### Status Icons
- ⏳ `pending` - Repository queued for processing
- 📦 `cloning` - Currently cloning repository  
- 📥 `pulling` - Currently pulling updates
- ✅ `success` - Operation completed successfully
- ❌ `failed` - Operation failed (see error message)
- ⚠️ `skipped` - Repository skipped (e.g., private repo without token)
- 🔄 `uncommitted` - Has uncommitted changes, pull skipped

### Visual Progress Bar
In multi-thread mode with live updates, the script displays a color-coded progress bar:
- 🟩 Green segments = Successfully completed
- 🟥 Red segments = Failed operations
- 🟨 Yellow segments = Skipped or uncommitted changes
- 🟦 Cyan segments = Currently processing
- ⬜ Gray segments = Pending operations

### Display Modes
- **Live Updates Mode** (default): Dynamic in-place updates with progress bar and windowed display
- **Append-Only Mode** (`--no-live-updates`): Traditional line-by-line output for terminal history preservation
- **Windowed Display**: Automatically adjusts visible repositories based on terminal height to prevent scrolling

## Fork Synchronization

The `--pull-changes-to-fork` option enables automatic synchronization of forked repositories with their upstream (parent) repositories. This feature is particularly useful for keeping your personal forks up to date with the latest changes from the original repositories.

### How It Works

1. **Fork Detection**: The script automatically detects which repositories are forks using GitHub API metadata
2. **Upstream Remote**: Adds the parent repository as an "upstream" remote if it doesn't already exist
3. **Fetch & Merge**: Fetches changes from the upstream repository's default branch and merges them into your current branch
4. **Push Updates**: Pushes the merged changes back to your fork on GitHub
5. **Conflict Handling**: Gracefully handles merge conflicts and reports them in the summary

### Usage Examples

```bash
# Sync all your forked repositories with their upstream sources
gh-pull-all --user your-username --pull-changes-to-fork

# Use SSH for faster operations on forks
gh-pull-all --user your-username --pull-changes-to-fork --ssh

# Process forks with custom concurrency
gh-pull-all --user your-username --pull-changes-to-fork --threads 4
```

### Behavior Notes

- **Non-forks are skipped**: Repositories that are not forks will be skipped with a "Not a fork" message
- **Uncommitted changes**: Repositories with uncommitted changes are skipped to prevent data loss
- **Merge conflicts**: When conflicts occur, the repository is marked as failed with a detailed error message
- **Already up-to-date**: If no changes are needed, the repository is marked as "Already up to date with upstream"

This option cannot be combined with `--pull-from-default` or `--switch-to-default` as they serve different purposes.

## Requirements

- [Bun](https://bun.sh/) (>=1.2.0) or [Node.js](https://nodejs.org/) (>=22.17.0) runtime
- Git installed and configured
- For private repositories (optional):
  - [GitHub CLI](https://cli.github.com/) (recommended) OR
  - GitHub personal access token (via `--token` or `GITHUB_TOKEN` env var)
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

- **Unauthenticated**: 60 requests per hour (public repos only)
- **Authenticated**: 5,000 requests per hour (includes private repos)
- Authentication is automatically handled if GitHub CLI is set up
- Use `--threads 1` or `--single-thread` if hitting rate limits

## License

This project is released into the public domain under The Unlicense - see [LICENSE](LICENSE) file for details.
