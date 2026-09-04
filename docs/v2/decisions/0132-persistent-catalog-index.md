# ADR 0132: Persistent catalog manifest index

- Status: Accepted
- Date: 2026-09-04

## Context

`FilesystemExtensionCatalog` rescans every manifest on each cold build: on
the 3,231-extension reference corpus a cold scan costs ~3.0 s (9,949
commands) because 3,231 manifest files are opened and parsed. Directory
listings stay cheap, so the index only needs to avoid re-reading unchanged
manifests. On-demand refresh (ADR 0114) and the catalog watcher (ADR 0116)
already handle in-session freshness; this slice covers cold-start cost.

## Decision

- `FilesystemExtensionCatalog` accepts an optional host-owned `cachePath`.
  Cold builds reuse cached manifests after a per-file stat check
  (`mtimeMs` + size) and rewrite the index atomically with owner-only
  (`0600`) permissions. Changed manifests are re-read, added/removed
  directories are picked up from the live listing, and duplicate-name
  first-wins merge order is unchanged.
- The cache stores raw manifest bytes, not parsed manifests: the parsed
  `ExtensionManifest` shape (record-keyed preferences) is not re-parseable,
  so loads replay the exact live `JSON.parse` + `parseManifest` path. A
  tampered cache can only drop entries, never inject them.
- Any missing, corrupt, version-mismatched, root-mismatched, or
  group/other-readable cache falls back to a full scan. Cache I/O never
  throws into discovery.
- `NodeCoreDaemon` accepts an optional `catalogCachePath` passthrough. The
  packaged Electron configuration derives
  `<userDirectory>/v2/catalog-index.json` next to the daemon socket, with an
  optional `BLAST_V2_CATALOG_CACHE_PATH` override for explicit host-owned
  daemon mode.

## Boundary

No catalog protocol, discovery snapshot, watcher, or refresh changes. The
cache is a host-local performance optimization, not a trust boundary: it
must live in a host-only directory. No persistent package indexes, update
checks, or migration flows are added.

## Consequences

On the reference corpus the cached cold build issues 62% fewer syscalls
(36,259 → 13,729: 3,366 manifest opens → 138, content reads replaced by
metadata stats) for the identical 9,949-command result. Small packaged roots
see little absolute gain; large local roots skip re-reading thousands of
unchanged manifests on every daemon start.

## Verification

- cold-build correctness, change/add/remove detection, corrupt/version/
  root/permission fallback, and empty-path rejection tests;
- daemon option passthrough and Electron packaged/override/conflict tests;
- `pnpm --filter @blastlauncher/core-node run test`,
  `pnpm --filter blast run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
