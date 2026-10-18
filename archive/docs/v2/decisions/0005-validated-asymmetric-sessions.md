# ADR 0005: Use validated asymmetric protocol sessions

- Status: accepted
- Date: 2026-08-27

## Context

The protocol needs one selected version and one session identity before peers
exchange application messages. If both peers independently select identifiers
and send `ready`, conflict resolution and simultaneous-handshake behavior become
part of every transport implementation.

Transport input crosses a process or network trust boundary. TypeScript types do
not exist at runtime and cannot establish that an incoming value is a valid
protocol message.

## Decision

Use connector and acceptor roles during negotiation:

1. The connector sends `hello` with its identity and supported versions.
2. The acceptor validates `hello`, selects the highest shared version, creates
   the session ID, and returns `ready` with its own identity.
3. Either side sends a structured error and closes when negotiation fails.
4. All inbound values are runtime validated before session code reads them.
5. Only a ready session can exchange application messages.
6. Cancellation closes negotiation; graceful closure sends `shutdown` and then
   closes the transport.

## Consequences

- The listener side owns one authoritative session ID.
- The connection initiator and acceptor are explicit in adapters and tests.
- Protocol validation failures can be reported with stable field paths.
- A reconnect creates a new session rather than reviving ambiguous state.
- Authentication can later bind identities to the same handshake without
  changing transport semantics.
