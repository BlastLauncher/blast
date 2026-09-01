# `@blastlauncher/core-node`

Node.js filesystem manifest catalog for Blast V2.

`FilesystemExtensionCatalog` implements the `ExtensionCatalog` interface from
`@blastlauncher/core`. It scans a primary root that contains one subdirectory
per installed extension, optionally followed by ordered additional roots,
reads each Raycast-style `package.json` manifest, and resolves a stable
`{ extensionId, commandName }` identity into the `ExtensionDescriptor` the
extension host requires. The first valid manifest for a duplicate extension
name wins; an absent optional additional root is ignored.

## Resolution rules

- the manifest `name` is the `extensionId` and each `commands[].name` is a
  `commandName`; unrecognized manifest fields are allowed and ignored;
- extension-level preference defaults and the selected command's
  `commands[].preferences` defaults are merged into the descriptor's
  `preferences`, with command-level values taking precedence for duplicate
  names;
- when a command declares an `entrypoint`, it is resolved relative to the
  extension root and must stay inside that root; absolute paths and traversal
  are rejected with `catalog_entrypoint_outside_root`;
- otherwise the catalog probes the Raycast convention
  `src/<command-name>.tsx|.ts|.jsx|.js|.mjs|.cjs` and fails with
  `catalog_entrypoint_missing` when no candidate exists;
- manifests that cannot be read, parsed, or validated are skipped so one broken
  install cannot hide the rest of the catalog; the first sorted directory
  claiming a manifest name wins, making duplicate installations deterministic;
- a missing catalog root fails with `catalog_root_unreadable` instead of
  silently resolving nothing.

`listCommands()` exposes a deterministic, path-free command snapshot from the
validated manifest index. It never resolves entrypoints or returns roots,
dependencies, or preference values. `refresh()` invalidates that in-memory
index, and the core's command-list protocol calls it before discovery so the
existing application Refresh action observes external installs and updates.
`watch()` adds bounded Node filesystem change detection for configured roots;
it invalidates the same index and debounces a change callback, while the
`NodeCoreDaemon` owns the watcher's shutdown. There is still no persistent
index, recursive watcher, or installation flow. Callers may assign a
host-owned `rootSourceKind` and matching `additionalRootSourceKinds`; those
values appear only in path-free command summaries. The catalog never trusts a
manifest-provided source label. Packaged V2 uses direct extension directories
under `~/.blast/external-extensions` for user-managed external packages and
keeps that channel distinct from the Raycast-curated root.

The package also exposes the Node-only local listener from [ADR
0091](../../docs/v2/decisions/0091-bounded-local-core-listener.md). That
listener wraps accepted local sockets in `@blastlauncher/transport-node` and
delegates them to the transport-neutral core session without exposing
filesystem paths to clients. POSIX endpoints are mode `0600`, and the listener
cleans up only socket paths it owns.

`NodeCoreDaemon` composes the catalog, fixed Node launcher, extension host,
`BlastCore`, and local listener from explicit catalog, bootstrap, environment,
and socket options ([ADR 0092](../../docs/v2/decisions/0092-node-core-daemon-composition.md)).
The listener is the readiness point; shutdown closes client sessions before
the host and leaves no owned socket behind.

The package also exposes `connectLocalCoreClient` from [ADR
0095](../../docs/v2/decisions/0095-bounded-local-core-client.md). It composes
an explicitly supplied socket path with the transport-neutral `CoreClient`,
including bounded connection/handshake timeout, abort, framing, and failed
socket cleanup, so application hosts do not duplicate Node connection logic.

## Boundaries

This package may use Node.js APIs. Its catalog remains independent of transport,
while its local-listener and local-client modules may depend on
`@blastlauncher/transport-node`.
Its daemon-composition module may depend on the Node host launcher. It must not
depend on Electron, React, or the prototype packages, and it must not make
`@blastlauncher/core` depend on Node.
