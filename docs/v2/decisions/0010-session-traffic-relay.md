# ADR 0010: Session traffic relay to clients

- Status: accepted
- Date: 2026-08-28

## Context

Extension commands publish scene transactions and request capabilities over
their runtime session, but nothing on the host side consumed that traffic:
the supervisor stops at readiness and the session receive loop was unused.
The first vertical slice needs a deterministic client substitute that renders
the fixture list through the scene state buffer and executes brokered
capabilities before a real client protocol or daemon exists.

## Decision

`@blastlauncher/core` provides `relaySessionTraffic(session, options)`, the
single receive pump for one extension session:

- `scene.transaction` payloads are validated and published to the supplied
  `SceneTransactionSink` from ADR 0007;
- `capability.request` payloads are validated, verified against the
  authoritative session descriptor, executed by the configured
  `CapabilityBroker`, and answered with `capability.response`; identity
  mismatches are denied with `identity_mismatch` and never reach a provider,
  and a missing broker is denied with `capability_denied`;
- unknown message types are ignored for forward compatibility;
- invalid payloads of known types close the session and reject `relay.done`,
  because application traffic is untrusted until validated;
- `sendSceneEvent(eventId)` sends validated `scene.event` messages toward the
  extension so clients can invoke actions.

`relay.done` resolves when the session ends cleanly and rejects when invalid
traffic or a sink failure closes it. The relay is transport-independent and
works identically over in-memory sessions and real child processes.

## Consequences

- the vertical slice is complete on the host side: catalog, launch,
  negotiation, initialization, scene rendering into state, brokered
  capabilities, and action events;
- the future daemon reuses this relay per client instead of inventing a
  second dispatch path;
- the deterministic test client (sink plus `SceneStateBuffer`) is the
  reference consumer that the React renderer conformance suite and the first
  Electron client must match.
