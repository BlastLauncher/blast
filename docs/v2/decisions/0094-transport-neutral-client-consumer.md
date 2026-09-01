# ADR 0094: Add a transport-neutral client consumer

- Status: Accepted
- Date: 2026-08-31

## Context

The V2 core session now provides path-free command discovery, one-command
lifecycle messages, semantic scene transactions, and scene events. The
prototype Electron renderer still speaks directly to the V1 WebSocket runtime
and owns a legacy serialized tree, so moving it directly to the V2 socket would
mix transport, protocol, and UI state responsibilities.

The next client boundary should be usable by Electron and deterministic tests
without making the core depend on React, Electron, or a concrete transport.

## Decision

Add `@blastlauncher/client`, a transport-neutral controller around a connected
`@blastlauncher/core` `CoreClient`:

- the controller owns the single `receive()` pump for the client connection;
- `start()` requests a path-free command snapshot and publishes immutable
  controller snapshots to subscribers;
- command launch and stop accept only stable identities, while lifecycle
  responses update the controller state and active identity;
- validated `scene.transaction` messages are applied to a
  `SceneStateBuffer`, and the materialized semantic scene is exposed in the
  snapshot; `sendSceneEvent()` forwards client events through the core client;
- toast messages are delivered to an optional callback without becoming part
  of the scene state; and
- transport, protocol, scene, lifecycle, and malformed-message failures become
  structured controller failures and close the underlying client when the
  connection cannot safely continue.

The package has no React, Electron, Node.js, filesystem, or WebSocket
dependency. UI adapters may subscribe to snapshots and decide how to render
them. The existing one-active-command-per-connection rule remains in force.

## Boundary

This slice creates the client state/transport seam and proves it with an
in-memory core session plus a real daemon socket. It does not replace the V1
renderer, add Electron IPC, add search or pagination over discovery, or change
the core wire contract.

## Consequences

The desktop client can migrate incrementally: a future Electron adapter can
connect a local daemon, subscribe to one typed snapshot source, render the
semantic scene, and dispatch events without knowing extension paths. Tests can
exercise the same consumer without launching Electron. The controller is
intentionally snapshot-based; richer client caching remains a later boundary.
The daemon-owned catalog change notification and idle refresh policy are
defined separately by ADR 0116.

## Verification

- prove command discovery, launch, scene application, event forwarding, stop,
  and failure transitions over an in-memory session;
- prove the same controller works through the Node daemon's local socket;
- verify scene referential failures close the client and do not leave a stale
  active command; and
- keep the full V2 suite green on ARM64 Linux without requiring an Electron
  launch.
