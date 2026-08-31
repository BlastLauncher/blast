# ADR 0095: Add a bounded local core client connector

- Status: Accepted
- Date: 2026-08-31

## Context

`@blastlauncher/core-node` currently exposes the bounded local listener, while
clients must still create a Node socket, wait for its connection, wrap it in
the JSON-lines transport, and perform the V2 handshake themselves. That is
acceptable for fixtures but would make the Electron main process own an
unreviewed copy of socket error, timeout, abort, and failed-handshake cleanup.

The transport-neutral `CoreClient` and the Node listener already define the
semantic boundary. The missing piece is a small Node-only connector that
composes the local operating-system transport with that boundary without
adding socket paths to protocol messages or making the client package depend
on Node.

## Decision

Add `connectLocalCoreClient` to `@blastlauncher/core-node`:

- it accepts an explicitly absolute Unix-socket path on POSIX or an absolute
  named-pipe path on Windows, plus the existing `CoreClientConnectOptions`;
- it creates a `net.Socket`, applies the same bounded JSON-lines frame limit as
  the listener, and delegates protocol negotiation to `connectCoreClient`;
- it has a finite local-socket connection/handshake deadline and supports the
  caller's `AbortSignal` before and during connection/handshake;
- failed connection, timeout, and abort outcomes use a typed
  `LocalCoreClientError`, include only local diagnostic details, and destroy
  the socket before rejecting; and
- successful connections return the existing `CoreClient`, whose normal
  `close()` owns protocol shutdown and transport closure.

The connector does not start or stop the daemon, retry connections, discover
the socket path, or expose the socket on the returned client. Daemon ownership
and application retry policy remain with the host application. The default
connection/handshake deadline is five seconds and is independently bounded
from the listener's handshake deadline.

## Boundary

This is a Node-process integration seam for local clients. It does not change
the protocol, the transport-neutral client controller, the listener's access
policy, or the Electron renderer. The first consumer remains an expected
Electron main-process adapter, while the V1 WebSocket path remains the default
until a production V2 bootstrap and catalog layout are selected.

## Consequences

Local clients get one tested connection lifecycle and consistent failure
semantics. The socket path and operating-system errors remain host-only, and
the protocol continues to see only the negotiated peer and semantic messages.
The connector is intentionally not a general remote transport; future
WebSocket or authenticated transports compose `connectCoreClient` separately.

## Verification

- connect to a real local listener and complete discovery/lifecycle traffic;
- reject missing or unusable socket paths with structured local errors;
- cover an already-aborted signal and a deterministic connection deadline;
- destroy failed sockets without leaving an unhandled `error` event; and
- keep the focused Node tests and full V2 suite green on ARM64 Linux.
