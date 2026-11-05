# v3 prereleases

Run **v3 prerelease** from the repository's GitHub Actions tab and enter a
version such as `3.0.0-alpha.1`, `3.0.0-beta.2`, or `3.0.0-rc.1`. Leave
**dry_run** enabled to verify, build, smoke-test, and retain the eight npm
tarballs plus the embedder schema as a workflow artifact. A real run clears
that checkbox and publishes only versions that are not already on npm.

Prereleases use the `next` npm dist-tag and do not move `latest`, which stays
on Blast v1. The workflow tags the commit as `v<version>` and creates a GitHub
prerelease with generated notes.

## Website

The `site` workflow publishes `blast.yukai.dev` through the Blast repository's
GitHub Pages Actions source and publishes the browser sandbox to the
`gh-pages` branch of `BlastLauncher/blast-sandbox`. After the first deployment,
enable Pages for `blast-sandbox` from that branch, then enable HTTPS enforcement
on both repositories once their certificates exist.

## Trusted publishing

Publishing uses npm trusted publishing: the publish job's GitHub Actions OIDC
token (`id-token: write`) is exchanged for a short-lived credential, so no
`NPM_TOKEN` secret exists, and npm adds provenance automatically. It needs npm
11.5.1 or later; the job checks this before publishing.

npm cannot attach a trusted publisher to a package that has never been
published. One-time setup, by an owner logged in to npm (`npm login`) with
npm 11.15 or later:

    bun run release:bootstrap

It prints, without running anything: when any package name is still
unpublished, a build and a first manual publish of all eight packages at
`3.0.0-alpha.0` (in dependency order, so that version installs), then one
`npm trust github <package> --file prerelease.yml --repo BlastLauncher/blast`
per package. Run the printed commands. Afterwards, consider disallowing token
publishing in each package's npm settings; trusted publishing keeps working.

Dry runs need no npm setup. A real run fails at publish time if a package's
trusted publisher is missing or names a different workflow file.
