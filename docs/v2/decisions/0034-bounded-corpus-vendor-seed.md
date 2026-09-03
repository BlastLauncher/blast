# ADR 0034: Bounded corpus vendor seed

- Status: accepted
- Date: 2026-08-29

## Context

The pinned corpus probe currently classifies 1,277 extensions as third-party
dependency failures. The runtime already has an explicit `vendored` dependency
policy, but the repository's workspace vendor root intentionally contains only
the launcher's own dependency graph. Installing the entire public corpus graph
would be large, fragmented across incompatible ranges, and would mix corpus
measurement with extension installation.

## Decision

Add a small, exact-version dependency seed to the private `@blastlauncher/e2e`
package as development-only dependencies:

| Package              | Pinned version |
| -------------------- | -------------: |
| `axios`              |        `1.8.4` |
| `cheerio`            |        `1.0.0` |
| `cross-fetch`        |        `4.0.0` |
| `date-fns`           |        `4.1.0` |
| `fast-xml-parser`    |        `5.3.2` |
| `fuse.js`            |        `7.1.0` |
| `moment`             |       `2.30.1` |
| `node-html-markdown` |        `1.3.0` |
| `rss-parser`         |       `3.13.0` |
| `zod`                |       `3.24.3` |

The normal workspace installation supplies these packages through the existing
explicit e2e probe vendor root. The lockfile records their transitive graph.
This seed is an audited measurement input, not a promise that every extension's
declared semver range is satisfied and not a production extension installer.

In an isolated esbuild audit against the current post-slice report, the seed
resolved 297 of the 1,277 dependency-classified entrypoints. The remaining
dependency graph stays explicit and measurable; packages with native behavior,
unbounded or sensitive capabilities, or extension-local files remain outside
this first seed.

## Consequences

- Corpus coverage can improve through a reviewable, reproducible dependency
  group without allowing extension execution to invoke a package manager.
- Exact versions and all transitive resolutions are visible in the workspace
  manifest and lockfile, so future seed additions can be audited in small
  groups.
- The seed is limited to e2e development tooling. Runtime and production
  launchers still require an explicitly provisioned vendor root and policy.
- A follow-up probe must measure rendered outcomes, not only bundle resolution,
  before this seed is treated as a coverage milestone.
