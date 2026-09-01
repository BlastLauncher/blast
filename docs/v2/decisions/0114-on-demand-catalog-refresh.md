# ADR 0114: Refresh the V2 extension catalog on demand

- Status: Accepted
- Date: 2026-08-31

## Context

The packaged V2 daemon already reads local development, explicit external, and
Raycast-curated extension roots, and the Electron command chooser already
exposes a Refresh action. The filesystem catalog currently caches its first manifest scan for the
life of the daemon, however. An extension installed, removed, or updated
outside the process therefore remains invisible until the daemon is restarted,
which makes the existing refresh affordance misleading.

V1 was never published, so this slice does not need to migrate user data or
preserve a V1 catalog format. It should make the current V2 boundary truthful
without adding an installer, dependency provisioning, filesystem watchers, or
new protocol messages.

## Decision

Add an explicit `refresh()` operation to the trusted filesystem catalog. The
operation invalidates the in-memory manifest index; the next list or resolve
operation rebuilds it using the same ordered roots, duplicate-name precedence,
manifest validation, and entrypoint safety checks as the initial scan.

Expose the operation through `BlastCore.refreshCommands()`. A core command-list
request refreshes the catalog before returning its path-free discovery snapshot,
so both the Electron Refresh action and future clients use the same freshness
policy. In-flight command sessions are not interrupted, and resolving an
already-running command continues to use its trusted descriptor.

Automatic filesystem watching was later added as the bounded watcher lifecycle
in [ADR 0116](0116-automatic-catalog-change-detection.md); a persistent catalog
index remains a separate follow-up. Clients may still request an explicit
refresh after an installation or update operation, and the daemon never
installs or downloads extension dependencies itself.

## Boundary

This is an on-demand catalog freshness policy across the Node catalog, core,
and existing command-list protocol. It does not add extension installation,
dependency management, migration, persistent indexing, or host capabilities.

## Consequences

The current V2 Refresh action now observes changes in both configured extension
roots without restarting the daemon. Catalog reads remain deterministic and
fail closed, while the cache still avoids repeated directory scans during one
refresh cycle. A future installer can call the same refresh operation without
changing the protocol or exposing filesystem paths to the client; the watcher
in ADR 0116 uses the same invalidation boundary.

## Verification

- refresh a catalog after adding, removing, and changing a manifest;
- preserve ordered multi-root duplicate precedence after refresh;
- verify core command discovery invokes the catalog refresh hook;
- run the Node core, Electron, V2, format, and lint checks; and
- keep generated Electron packaging artifacts out of the worktree.
