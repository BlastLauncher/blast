# v3 prereleases

Run **v3 prerelease** from the repository's GitHub Actions tab and enter a
version such as `3.0.0-alpha.1`, `3.0.0-beta.2`, or `3.0.0-rc.1`. Leave
**dry_run** enabled to verify, build, smoke-test, and retain the eight npm
tarballs plus the embedder schema as a workflow artifact. A real run clears
that checkbox and publishes only versions that are not already on npm.

Prereleases use the `next` npm dist-tag and `npm publish --provenance`; they do
not move `latest`. The workflow tags the commit as `v<version>` and creates a
GitHub prerelease with generated notes.

Before the first real run, an owner must add the repository `NPM_TOKEN` secret
with publish access to the `@blastlauncher` npm scope. The token must be able
to publish every package in the release set. Dry runs do not need the secret.
