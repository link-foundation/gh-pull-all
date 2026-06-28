export const HELP_TEXT = `
Usage: gh-pull-all [--org <organization> | --user <username>] [options]

Options:
  -o, --org <name>              GitHub organization name
  -u, --user <name>             GitHub username
  -t, --token <token>           GitHub personal access token (optional for public repos)
  -s, --ssh                     Use SSH URLs for cloning (requires SSH key setup)
  -d, --dir <path>              Target directory for repositories (default: current directory)
  -j, --threads <number>        Number of concurrent operations (default: 8)
      --single-thread           Run operations sequentially (equivalent to --threads 1)
      --live-updates            Enable live in-place status updates (default: true)
      --no-live-updates         Disable live updates for terminal history preservation
      --delete                  Delete all cloned repositories (with confirmation)
      --pull-from-default       Pull changes from default branch into current branch when behind
      --switch-to-default       Switch to the default branch (main/master) in each repository
      --pull-changes-to-fork    Update forks with changes from their parent repositories
  -h, --help                    Show help
  -v, --version                 Show version number

Examples:
  gh-pull-all
    Auto-detect GitHub owner from local repositories or directory name

  gh-pull-all --org deep-assistant
    Sync all repositories from deep-assistant organization

  gh-pull-all --user konard
    Sync all repositories from konard user account

  gh-pull-all --user github.com/konard
    Sync all repositories from a GitHub URL owner

  gh-pull-all --org myorg --ssh --dir ./repos
    Clone using SSH to ./repos directory

  gh-pull-all --user konard --threads 5
    Use 5 concurrent operations

  gh-pull-all --user konard --single-thread
    Run operations sequentially

  gh-pull-all --user konard --no-live-updates
    Disable live updates for terminal history preservation

  gh-pull-all --user konard --delete
    Delete all cloned repositories (with confirmation)

  gh-pull-all --user konard --pull-from-default
    Pull from default branch to current branch when behind

  gh-pull-all --user konard --switch-to-default
    Switch all repositories to their default branch

  gh-pull-all --user konard --pull-changes-to-fork
    Sync forked repositories with their upstream repositories
`
