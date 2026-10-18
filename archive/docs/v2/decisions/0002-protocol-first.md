# ADR 0002: Make the extension protocol the stable boundary

- Status: accepted
- Date: 2026-08-27

## Context

The prototype couples a custom React renderer directly to an RPC WebSocket and
emits a complete serialized tree. API components also perform host operations
directly. These choices make isolation, alternate clients, remote execution,
and permission enforcement difficult.

## Decision

Define a small, versioned protocol independent of React, Electron, Node.js, and
transport. Raycast compatibility, extension execution, clients, and capability
providers all adapt to that protocol.

Start with the message envelope and handshake. Add scene and capability messages
only alongside tested vertical slices.

## Consequences

- WebSocket remains available but is no longer a fixed system boundary.
- Clients can be replaced without changing extension APIs.
- Protocol changes require compatibility and versioning discipline.
- React reconciliation becomes an adapter concern rather than the wire format.
