# ADR 0091: Expose the core session through a bounded local listener

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0090 established the transport-neutral client/core session, and the real
child-process vertical slice now exercises that contract. The desktop client
still has no process boundary it can connect to: the existing Electron entry
point launches the prototype runtime directly, while V2 has no listener that
owns local client connections.

The next seam should make the V2 core reachable by a same-user Node client
without changing the semantic session contract or introducing a network
surface. It also needs to behave predictably when a prior daemon crashed and
left a socket path behind.

## Decision

Add a Node-only local listener to `@blastlauncher/core-node` (implemented as
part of this slice):

- `LocalCoreServer` listens on an explicitly supplied Unix-domain socket path
  on POSIX systems; the same option can carry a Windows named-pipe path;
- each accepted socket is wrapped in the existing bounded
  `createJsonLineTransport` and handed to `acceptCoreClientSession`, so the
  client/core messages and role checks remain those of ADR 0090;
- the listener limits concurrent connections and handshake duration, and the
  JSON-lines transport continues to enforce the per-frame byte limit;
- POSIX socket files are created with mode `0600`; a pre-existing non-socket
  path is never removed, and a pre-existing socket is removed only after a
  connection probe shows it is stale;
- listener shutdown stops accepting connections, closes active protocol
  sessions, aborts handshakes, and removes only the socket file this listener
  successfully owned; and
- the listener reports connection/session failures locally and does not add
  TCP, remote pairing, authentication, Electron, React, or filesystem catalog
  behavior to the V2 protocol.

The first listener supports multiple independent client connections, with the
ADR 0090 rule of one active command per connection. A later daemon façade can
own the listener, catalog refresh, capability providers, and policy lifecycle.
Same-user filesystem permissions are the initial local boundary; authenticated
peer identity remains future work before any broader local or remote exposure.

## Boundary

This slice proves a local Node connection from a client to the existing core
session. It does not replace the prototype Electron runtime, define command
discovery, persist daemon state, authenticate clients beyond socket ownership,
or expose a TCP/WebSocket endpoint.

## Consequences

The future Electron client can connect to a stable local endpoint without
knowing extension paths, child-process stdio, or the catalog implementation.
The listener remains a Node deployment concern and can be replaced by another
transport without changing `CoreClient` or the core/session protocol.

## Verification

- Start and stop a listener on a temporary local socket and complete the core
  handshake through `connectCoreClient`.
- Run a command through the socket and verify lifecycle delivery plus
  disconnect cleanup using a deterministic core fixture.
- Reject or safely handle occupied paths, excess connections, handshake
  timeout, malformed frames, and listener shutdown.
- Keep the transport conformance, core, e2e, and V2 suites green on ARM64
  Linux; no Electron launch is required for this slice.
