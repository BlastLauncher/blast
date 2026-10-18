# ADR 0126: Repo-fetch extension installation and one-by-one coverage loop

- Status: Accepted
- Date: 2026-09-03

## Context

V1 distributed extensions through npm publication by CI. V2 instead targets
100% Raycast API coverage against the public `raycast/extensions`
repository, so the install and test story changes: extensions arrive as
single folders from the repository, and coverage grows extension by
extension. The full corpus checkout is too large to clone routinely, and the
full probe is too slow to run per change — both need partial, pickable
workflows sharing one acquisition implementation.

## Decision

- Acquisition is a cached partial clone plus `git archive` streaming,
  implemented once in `@blastlauncher/core-node` as
  `fetchExtensionsFromRepo` with archive entry/byte bounds, per-directory
  missing detection, and structured errors (`repo_fetch_failed`,
  `extension_not_found`, `repo_archive_too_large`, `invalid_repo_options`).
  It is both the product install seam (staged into
  `ExternalExtensionStore.install`/`update`, which keep their manifest and
  entrypoint validation) and the probe acquisition path.
- Installation steps: `pnpm run fetch:v2 -- <name> [--target <catalog-dir>]`
  downloads one extension folder into a catalog directory — the product
  external-extensions root by default — and reports its manifest commands.
  Renderer-initiated repo install reusing the same fetch plus the store
  lifecycle is an explicit follow-up, not this slice.
- Coverage loop: `pnpm run probe:v2` already probes pickable sets without a
  full clone; `--from-report <last-full-run> --outcome <class> --limit N`
  batches directly through a failure class, and `--provision` runs each
  extension through the ADR 0125 installer path. The committed
  `test/fixtures/real` matrix stays the coverage ratchet: a fixed extension
  graduates by adding its trimmed sources plus an expectations entry.
- Automation: the `Compatibility Probe` workflow batches the chosen failure
  class on schedule and on manual dispatch (with provisioning on by
  default), uploads the report artifact, and summarizes outcomes. Extension
  failures do not fail the workflow — only infrastructure crashes do.
- Nothing changes about npm publication: all V2 packages are `private` and
  the `Publish` workflow ships Electron app bundles to GitHub releases, not
  npm packages.

## Boundary

This slice does not add renderer-initiated repo installation, automatic
fixture graduation, corpus auto-updates, or full-report regeneration in CI.
The pinned census revision stays the measurement baseline until a deliberate
re-pinning decision.

## Consequences

Installing and testing an extension no longer requires the multi-gigabyte
checkout or the full 3,231-extension probe. Each coverage fix follows one
repeatable loop — fetch, probe, fix adapter/provider, reprobe, graduate a
fixture — and the weekly batch keeps the failure-class backlog visible.

## Verification

- `fetchExtensionsFromRepo` unit tests against a local git corpus (fetch,
  missing detection, unsafe-name rejection, archive bounds);
- `probe:v2` and `fetch:v2` exercised end to end;
- `pnpm run lint` and `pnpm run fmt:check`.
