# ADR 0020: Explicit extension dependency policy

- Status: accepted
- Date: 2026-08-28

## Context

Raycast extension manifests declare third-party packages, but the V2 runtime
must not turn an extension launch into an implicit network install. The full
corpus probe needs a reproducible way to supply already-vetted packages while
keeping dependency failures distinguishable from compatibility failures.

## Decision

`createBundlingEntrypointLoader` accepts an explicit `dependencyPolicy`:

- `local` (the default) resolves the extension's installed dependency graph
  using normal esbuild lookup.
- `vendored` accepts absolute `vendorRoots`, which are additional launcher-
  provisioned package roots passed to esbuild as `nodePaths`.

The runtime never invokes npm, pnpm, or another package manager, and it never
downloads packages while loading an entrypoint. A launcher may provision and
audit a vendor root out of band, then pass it explicitly. Bundle cache keys
include the alias, React path, and dependency policy so a policy change cannot
reuse a stale bundle.

The corpus fixture bootstrap uses the repository's installed `node_modules`
as a deterministic vendor root. This improves measurement for packages that
are already available without pretending that the entire public corpus has
been installed. Native or unavailable packages remain explicit dependency
failures; installation, lockfile resolution, package signing, and native
externalization are follow-up launcher policy.

## Consequences

- Dependency availability is a controlled input to a probe or launcher, not a
  side effect of extension execution.
- Vendored package resolution is covered by a fixture and invalid roots fail
  with `dependency_policy_invalid` before a child process starts.
- The support matrix can report the remaining dependency gap separately from
  API compatibility and scene/runtime failures.
