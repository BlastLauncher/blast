# ADR 0009: Deny-by-default capability broker

- Status: accepted
- Date: 2026-08-28

## Context

Extensions must not receive ambient access to the desktop. Privileged
operations such as clipboard access cross the capability boundary, and the
architecture requires that requests include the extension identity, capability
name, and operation so the core can enforce policy and record audit events.
The first vertical slice needs one concrete flow: a clipboard write request
from a running extension command.

## Decision

Two validated wire messages carry capability traffic over the existing
extension session:

- `capability.request` (runtime toward the host/core) contains a request
  identifier, the extension identity, the capability and operation names, and
  primitive arguments.
- `capability.response` (host/core toward the runtime) contains the request
  identifier and one outcome: `succeeded` with an optional primitive value,
  `denied` with a code, or `failed` with a code and message.

Trust boundaries:

- The runtime channel stamps the descriptor identity and a fresh request
  identifier on every request; it never resolves a request without a matching
  response.
- The host verifies the request identity against the authoritative session
  descriptor before consulting policy; a mismatch is denied with
  `identity_mismatch` and never reaches a provider.
- The broker denies every request unless a provider is registered for the
  capability and the policy allows the extension identity, capability, and
  operation. Grants are per extension, not per command. Unknown capabilities
  are denied with `unknown_capability`; provider failures become structured
  `failed` responses instead of transport errors.
- `createGrantListPolicy` provides a deterministic allow-list; richer
  consent-driven policies remain future work.

The runtime command context gains `requestCapability`, and pending requests
are rejected when the session ends so awaiting commands cannot hang.

## Consequences

- clipboard access is now brokered, testable, and denied by default;
- real operating-system providers, manifest capability declarations, audit
  records, and consent UI can be added without changing the wire contract;
- a denied request is a normal structured outcome, not a crash;
- the same broker serves future capabilities such as open URLs, secure
  storage, notifications, OAuth, and selected filesystem access.
