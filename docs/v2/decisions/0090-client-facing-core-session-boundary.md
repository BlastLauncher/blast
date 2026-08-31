# ADR 0090: Establish the client-facing core session boundary

- Status: Proposed
- Date: 2026-08-31

## Context

The V2 extension runtime, host, core façade, scene contract, and measured
Raycast adapter can now run a command without Electron. The core currently
returns an internal extension session to tests, however, and does not expose a
validated client-facing protocol. The prototype Electron app still speaks
directly to its legacy WebSocket runtime, so wiring the desktop app to V2
without a boundary would couple the client to extension or renderer internals.

The next main-app seam must let a client replace the deterministic test client
incrementally while preserving the existing trust boundaries: clients choose
stable command identities, the trusted catalog chooses entrypoints, and the
core/host owns extension lifecycle and capability routing.

## Decision

Add a transport-neutral client session contract to `@blastlauncher/core`:

- the core accepts a protocol session from a peer with role `client`, and a
  client connects with role `client` to a peer with role `core`;
- the first application contract supports one active command per client
  connection, with validated `core.command.run` and `core.command.stop`
  requests carrying only `{ extensionId, commandName }` plus an optional stop
  reason;
- the core reports `started`, `start-failed`, and `stopped` command lifecycle
  messages, forwards validated `scene.transaction` and `ui.toast` messages to
  the client, and forwards validated `scene.event` messages from the client to
  the extension relay;
- all client messages use the existing versioned session and generic
  `ProtocolTransport`; the core contract does not depend on Electron, React,
  WebSocket, TCP, or a local-socket implementation; and
- a client disconnect stops its active command, while extension capability
  requests continue to flow through the existing core relay and deny-by-default
  broker rather than gaining a client-side ambient path.

## Boundary

This slice establishes the message and session ownership boundary only. It
does not add a daemon listener, persistent catalog, client discovery, multiple
commands per connection, desktop rendering, Electron IPC, or production
capability providers. A later transport-node slice can expose the same session
over a local socket; a later Electron slice can consume the client API.

The client receives semantic scenes and sends semantic events. It does not
receive extension entrypoint paths or root directories and cannot select them.

## Consequences

The deterministic test client can exercise the same core-facing lifecycle that
the desktop client will use, including scene updates and user events. The
existing extension session relay remains the sole extension traffic pump.
Keeping the first connection single-command makes ownership and disconnect
cleanup explicit; multiplexing is deferred until a real client flow requires
it.

## Verification

- Validate client/core handshake roles and all client payloads at the session
  boundary.
- Run an in-memory vertical test that starts a real fixture, receives its scene,
  sends an action event, and stops the command through the client contract.
- Cover invalid identities, start failures, malformed client messages, and
  disconnect cleanup deterministically.
- Keep the existing V2 suite green; no Electron launch or network listener is
  required for this first boundary.
