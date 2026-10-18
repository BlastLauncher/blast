# `@blastlauncher/session`

Validated protocol session state machine for Blast V2.

## Handshake

The handshake is deliberately asymmetric:

```text
connector                              acceptor
    | ----- hello(versions, identity) ----> |
    | <---- ready(version, session ID) ---- |
    |========== negotiated session =========|
```

The acceptor owns protocol selection and session-ID creation. `ready` also
contains the acceptor identity, so both peers know the role and implementation
on the other side.

If the hello is invalid or no version overlaps, the acceptor sends a structured
`error` and closes the transport. Cancellation also closes the transport so a
pending read cannot leave a half-open session.

## States

```text
negotiating -> ready -> closing -> closed
      |          |
      +----------+-> failed
```

Only a ready session can send application messages. One owner consumes
`receive()`; callers must not iterate the underlying transport concurrently.
Inbound values and control-message payloads are validated before use. A
malformed message, unexpected handshake message, or protocol-version mismatch
fails and closes the session.

An application send failure also marks the session failed and closes its
transport. Cleanup errors never replace the protocol error that caused failure.

`close()` sends a structured `shutdown` before closing the transport. Receiving
`shutdown` closes the local session and returns the shutdown message so the
caller can record its reason.

## Code map

- `handshake.ts` owns connector/acceptor negotiation.
- `session.ts` owns ready-session messaging and shutdown transitions.
- `local-options.ts` validates locally supplied identities and ID factories.
- `async.ts` contains cancellation-aware iterator reads.
- `errors.ts` defines the stable session error shape.
