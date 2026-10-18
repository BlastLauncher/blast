# `@blastlauncher/compatibility`

Static compatibility scanning and census tooling for Blast V2.

The package scans Raycast extensions without executing any code:

- `readManifestSummary` summarizes `package.json` manifests leniently
  (identity, categories, command modes, preference types, and the
  `@raycast/api` dependency range);
- `scanExtension` / `scanCorpus` parse source files with the TypeScript
  compiler API and collect every `@raycast/api` import site: named (including
  type-only and aliased), namespace, re-exported, dynamic `import()`, and
  `require()`;
- `buildCensusReport` aggregates scans into a deterministic report that
  records the corpus revision and protocol version and contains no
  timestamps.

The committed corpus census and the adapter plan derived from it live in
`docs/v2/compatibility/`. Regenerate the artifact with
`scripts/scan-corpus.mjs <corpus-dir> <revision> <out-file> [corpus-url]`.

## Boundaries

The census is descriptive tooling: it never runs extension code and its
output is data, not an executable contract. It must not depend on Electron,
React, or any concrete transport.
