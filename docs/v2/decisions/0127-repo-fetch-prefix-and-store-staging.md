# ADR 0127: Fix repo-fetch prefix and stage installs through the store

- Status: Accepted
- Date: 2026-09-04

## Context

ADR 0126 defined `fetchExtensionsFromRepo` as the shared acquisition seam for
both product installs (`pnpm run fetch:v2`) and the coverage loop
(`pnpm run probe:v2`), staged into `ExternalExtensionStore.install`/`update`.
The implementation archived bare directory names, but the public
`raycast/extensions` repository nests extensions under `extensions/`, so every
real `fetch:v2`/`probe:v2` name missed. `fetch:v2` also wrote directly into the
target catalog instead of staging through the store, losing manifest and
entrypoint validation, atomic activation, backup, and version-aware
install/update decisions.

## Decision

- `fetchExtensionsFromRepo` tries `extensions/<name>` paths first with one
  leading archive component stripped, then falls back to bare `<name>` paths
  so synthetic test repositories keep working. Archive entry/byte bounds,
  per-directory missing detection, and structured errors are unchanged. A new
  optional `pathPrefix` option (default `"extensions"`) keeps the layout
  explicit and testable.
- `pnpm run fetch:v2` fetches into a temporary staging root, then installs
  through `ExternalExtensionStore`: `install` when absent, `update` when the
  staged version differs, no-op with an `up-to-date` report when versions
  match. A `--direct` flag preserves the old raw-copy path for debugging only.
  The probe path keeps raw fetching into its temporary corpus root.

## Boundary

No registry browser, npm resolution, dependency installation, signatures,
auto-updates, curated-root writes, or protocol changes. The store keeps its
existing validation, atomicity, and one-slot backup semantics; the watcher and
manual refresh remain the catalog freshness mechanism.

## Consequences

The documented fetch/probe/reprobe loop works against the real repository
layout, and product installs reuse the same validation and recovery as the
Electron package controls.

## Verification

- prefixed-layout fetch test plus existing bare-layout tests;
- `pnpm --filter @blastlauncher/core-node run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
