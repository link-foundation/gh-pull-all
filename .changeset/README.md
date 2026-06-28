# Changesets

Changesets describe release-impacting pull requests without editing package versions directly.

Add one Markdown file per code-changing pull request. The release workflow consumes pending changesets on `main`, updates package versions, and publishes the package.
