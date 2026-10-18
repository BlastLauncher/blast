# ADR 0006: Fixed process bootstrap and explicit extension readiness

- Status: accepted
- Date: 2026-08-27

## Context

A spawned process or negotiated protocol connection does not prove that an
extension command loaded. Passing entrypoint paths directly from a client to a
launcher would also bypass the future registry and permission boundary. Stdio
is attractive for isolated local processes but must not become the semantic
application protocol.

## Decision

The core resolves stable command identities through a trusted catalog. A
concrete launcher starts a host-configured bootstrap, never the client-provided
entrypoint directly. The runtime initiates a normal versioned session and must
identify as `extension-runtime`.

After negotiation, the host sends a validated `extension.initialize` containing
the authoritative descriptor. The runtime performs its initialization hook and
then sends matching `extension.ready`. The host publishes the session only after
that acknowledgement.

The Node launcher uses bounded JSON-lines framing over stdio. Stdout is reserved
for frames and stderr is diagnostics. Framing remains an implementation of
`ProtocolTransport`; application semantics remain in protocol/domain packages.
Environment inheritance is explicit, the shell is disabled, and shutdown
escalates after a grace period.

## Consequences

- startup failures have a precise stage and never appear as active commands;
- clients and remote callers cannot select arbitrary filesystem paths;
- alternative runtimes and transports can keep the same initialization flow;
- runtime bootstrap and extension entrypoint are distinct artifacts;
- the first Node launcher is process isolation, not yet a complete security
  sandbox;
- module loading, capability policy, and scene messages remain independently
  testable vertical slices.
