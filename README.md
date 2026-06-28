[![npm version](https://img.shields.io/npm/v/gh-pull-all)](https://www.npmjs.com/package/gh-pull-all)
[![GitHub release](https://img.shields.io/github/v/release/link-foundation/gh-pull-all)](https://github.com/link-foundation/gh-pull-all/releases)
[![Checks and release](https://github.com/link-foundation/gh-pull-all/actions/workflows/release.yml/badge.svg)](https://github.com/link-foundation/gh-pull-all/actions/workflows/release.yml)
[![Open in Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-f29718?logo=gitpod)](https://gitpod.io/#https://github.com/link-foundation/gh-pull-all)
[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=link-foundation/gh-pull-all)

# gh-pull-all

The script that pulls it all - efficiently sync all repositories from a GitHub organization or user account with parallel processing, auto-detection, and real-time status updates.

## Features

- 🚀 **Parallel Processing**: Configure concurrent operations with `--threads` option (default: 8)
- 📊 **Real-time Status**: In-place updating display shows progress for each repository
- 🔄 **Smart Updates**: Automatically pulls existing repos and clones new ones
- 🍴 **Fork Sync**: Update forked repositories from their upstream parent repositories with `--pull-changes-to-fork`
- 🔐 **SSH Support**: Use SSH URLs for cloning with `--ssh` flag
- ⚡ **Flexible Threading**: Use `--single-thread` for sequential processing or customize with `--threads N`
- 🎯 **Comprehensive**: Works with both organizations and user accounts
- 🔍 **Auto Detection**: Omit `--org` and `--user` to detect the GitHub owner from local repositories or an empty target directory name
- 🔑 **Smart Authentication**: Automatic GitHub CLI integration for seamless private repo access
- 🛡️ **Error Handling**: Graceful handling of rate limits, authentication, and network issues
- 📈 **Visual Progress Bar**: Color-coded progress bar shows real-time status (green=success, red=failed, yellow=skipped, cyan=active, gray=pending)
- 🖥️ **Smart Terminal Display**: Windowed display mode automatically adjusts to terminal height for large repo counts
- 🔍 **Uncommitted Changes Detection**: Automatically detects and skips repositories with uncommitted changes
- 📋 **Error Summary**: Numbered error tracking with detailed error list at completion
- ⚡ **Smooth Updates**: 10 FPS render loop for fluid terminal animations in multi-thread mode

## Quick Start

```bash
# Auto-detect from local repository remotes or the current folder name
gh-pull-all

# Clone all repositories from a user account
gh-pull-all --user octocat

# Clone all repositories from an organization
gh-pull-all --org github

# Names can also be GitHub URLs
gh-pull-all --user github.com/octocat

# Use SSH for cloning with custom thread count
gh-pull-all --user octocat --ssh --threads 16

# Sync forked repositories from their upstream parent repositories
gh-pull-all --user octocat --pull-changes-to-fork

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
Usage: gh-pull-all [--org <organization-or-url> | --user <username-or-url>] [options]

Omit --org and --user to auto-detect the GitHub owner from local repositories or the target directory name.

Options:
  -o, --org            GitHub organization name or URL
  -u, --user           GitHub username or URL
  -t, --token          GitHub personal access token (optional for public repos)
  -s, --ssh            Use SSH URLs for cloning (requires SSH key setup)
  -d, --dir            Target directory for repositories (default: current directory)
  -j, --threads        Number of concurrent operations (default: 8)
      --single-thread  Run operations sequentially (equivalent to --threads 1)
      --live-updates   Enable live in-place status updates (default: true)
      --no-live-updates Disable live updates for terminal history preservation
      --delete         Delete all cloned repositories after confirmation
      --pull-from-default Pull default branch changes into the current branch
      --switch-to-default Switch each repository to its default branch
      --pull-changes-to-fork Update forks from their upstream parent repositories
  -h, --help           Show help
```

## Auto Detection

When neither `--org` nor `--user` is provided, `gh-pull-all` enables auto mode by default:

1. It checks child folders in the current directory, or in the directory passed with `--dir`.
2. It inspects child folders that are git repositories and reads their GitHub remotes.
3. If all detected GitHub remotes belong to one owner, it validates whether that owner is a GitHub user or organization and asks for confirmation.
4. If the target directory is empty, it tries the target directory name as a GitHub user or organization and asks for confirmation.
5. If detection is ambiguous or invalid, it prompts for a GitHub name or URL such as `github.com/name`.

No preferences are written to `.gh-pull-all`; pass `--user` or `--org` when you want to skip detection.

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
# Auto-detect owner from local git remotes or an empty directory name
gh-pull-all

# Basic usage - sync all public repos from a user
gh-pull-all --user octocat

# GitHub URL input
gh-pull-all --org https://github.com/github

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

# Update forked repositories from their upstream parent repositories
gh-pull-all --user octocat --pull-changes-to-fork

# Update forks using SSH remotes
gh-pull-all --user octocat --pull-changes-to-fork --ssh
```

## Fork Synchronization

The `--pull-changes-to-fork` option updates forked repositories from their upstream parent repositories. It detects forks from GitHub metadata, adds or updates the local `upstream` remote, fetches the upstream default branch, merges it into the matching local fork branch, and pushes the synchronized branch back to the fork.

Non-fork repositories are skipped. Repositories with uncommitted local changes are skipped to avoid overwriting work. Merge conflicts are reported in the final error summary for manual resolution.

This option cannot be combined with `--pull-from-default` or `--switch-to-default`.

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
npm test

# Run specific test categories
node tests/test-cli-simple.mjs      # CLI validation tests
node tests/test-github-api.mjs      # GitHub API integration tests
node tests/test-file-operations.mjs # File system and git operations
node tests/test-threading.mjs       # Thread configuration tests
node tests/test-parallel.mjs        # Parallel processing tests
node tests/test-integration.mjs     # End-to-end integration tests
```

## Rate Limits

- **Unauthenticated**: 60 requests per hour (public repos only)
- **Authenticated**: 5,000 requests per hour (includes private repos)
- Authentication is automatically handled if GitHub CLI is set up
- Use `--threads 1` or `--single-thread` if hitting rate limits

## License

This project is released into the public domain under The Unlicense - see [LICENSE](LICENSE) file for details.
