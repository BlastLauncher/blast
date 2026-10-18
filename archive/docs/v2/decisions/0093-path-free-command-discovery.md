# ADR 0093: Add path-free command discovery to the client session

- Status: Accepted
- Date: 2026-08-31

## Context

The Node daemon now owns a trusted filesystem catalog and can serve a client
session over a bounded same-user socket. Clients still need to know an
extension identity before they can issue `core.command.run`, so a desktop
client cannot present a launcher list through the V2 boundary.

The catalog already has the authoritative manifest index. Discovery should
reuse that index, remain a snapshot operation, and never turn the client into a
filesystem or entrypoint authority.

## Decision

Extend `@blastlauncher/core` and the client session with a path-free discovery
contract:

- a client sends `core.command.list` with an empty payload;
- the core replies with `core.command.listed`, containing deterministic command
  summaries with stable `extensionId`, `commandName`, display title, extension
  title/owner metadata, and the manifest `entryPointMode`;
- a catalog that does not support discovery produces a structured
  `core.command.list-failed` response instead of an empty or fabricated list;
- `FilesystemExtensionCatalog.listCommands()` builds summaries from its
  validated, sorted manifest index and never resolves entrypoints for this
  operation; and
- summaries exclude `entrypoint`, `rootDirectory`, dependency paths,
  preference values, and other host-only data. Existing run/stop and one-active
  command-per-connection rules are unchanged.

The request is handled by the existing single client-session receive pump.
There is no watch or push protocol in this slice; clients request a fresh
snapshot. A future daemon can add invalidation or richer metadata without
making filesystem paths part of the client contract.

## Boundary

This slice provides enough metadata for a client to render a command chooser
and then launch by stable identity. It does not add search, pagination, command
watching, installation, preference editing, authorization, or scene rendering.

## Consequences

Clients no longer need an out-of-band catalog to choose a command. Discovery
errors remain visible and typed, while the core retains sole authority over
filesystem resolution. Deterministic ordering makes snapshots suitable for
tests and stable client rendering.

## Verification

- List commands from the filesystem catalog in sorted deterministic order and
  assert that no returned value contains a filesystem path or preference value.
- Exercise list success and catalog-unavailable/failure responses through the
  in-memory core session and the real local daemon socket.
- Keep existing run/stop, compatibility, e2e, and V2 tests green on ARM64
  Linux.
