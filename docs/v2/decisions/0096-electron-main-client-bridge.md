# ADR 0096: Keep V2 client ownership in the Electron main process

- Status: Accepted
- Date: 2026-08-31

## Context

The V2 client controller and bounded Node socket connector are now available,
but the Electron application still has a V1 renderer that speaks directly to
the legacy WebSocket runtime and receives a mutable serialized element tree.
Moving the renderer directly to the V2 socket would give it filesystem
transport knowledge, duplicate the receive-pump lifecycle, and make the V1/V2
migration difficult to roll back.

The desktop process already has the natural ownership boundary for local
transport and privileged actions. The next seam should let the renderer
consume V2 state without making the production app pretend that its daemon
startup, installed-extension layout, and scene UI migration are complete.

## Decision

Add an opt-in Electron main-process bridge with two layers:

- `@blastlauncher/client` adds a transport-neutral `CoreClientHost` that
  injects a connection factory, owns one `CoreClientController`, and publishes
  controller snapshots to isolated sinks. It has no Electron, Node, or IPC
  dependency and is tested with deterministic client doubles.
- `apps/electron-client` adds a V2 IPC adapter that creates the host in the
  main process, registers a preload-safe command/event surface, and sends
  serialized snapshots to subscribed `webContents`. The renderer can request
  discovery, run/stop a stable command identity, send a scene event, and close
  the client, but it never receives the socket path or a live client object.

The adapter is enabled only when the main process receives an explicit
`BLAST_V2_SOCKET_PATH`. That path points to an externally started V2 daemon in
this slice; the application does not yet choose a production bootstrap,
catalog layout, or daemon restart policy. The existing V1 runtime and renderer
remain the default when the variable is absent.

IPC inputs are validated at the main-process boundary before reaching the
controller. Snapshot error details are reduced to JSON-safe values so an
extension or transport error cannot smuggle functions, live errors, or cyclic
objects into renderer IPC. Subscription cleanup follows the sender's
`destroyed` event, and bridge shutdown is best effort during application quit.

## Boundary

This slice establishes main-process ownership and a reversible IPC seam. It
does not render V2 `SceneNode` values in the existing V1 React components,
start a V2 daemon from Electron, migrate extension installation directories,
or change the V2 protocol and local-socket access policy.

## Consequences

The future renderer migration can consume one snapshot stream and dispatch
semantic events without knowing how the daemon is reached. The main process
remains the only place that can connect to a local socket or decide how a
client failure is reported. The opt-in flag makes the seam buildable and
testable on ARM64 Linux without making the unfinished V2 app path the default.

## Verification

- test `CoreClientHost` lazy connection, shared concurrent startup, snapshot
  publication, command forwarding, and shutdown with deterministic doubles;
- type-check and Forge-bundle the Electron main/preload bridge for Linux/arm64
  without launching the native UI;
- validate IPC inputs at the main-process helper boundary and cover host
  forwarding/cleanup with deterministic client tests;
- verify JSON-safe snapshot serialization for structured and non-serializable
  failure details; and
- keep the V1 app path unchanged and the full V2 suite green.
