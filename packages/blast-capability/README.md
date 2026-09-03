# `@blastlauncher/capability`

Capability request broker for Blast V2 (ADR 0009).

The package owns the capability wire contract and the deny-by-default broker
that separates extensions from host operations such as clipboard access.

## Contents

- `capability.request` and `capability.response` message validators, plus
  payload-level validators for reuse by senders;
- `CapabilityBroker`: denies every request unless a provider is registered for
  the capability and the policy allows the extension identity, capability, and
  operation; provider failures become structured `failed` responses;
- `CapabilityPolicy` with `denyAllPolicy` as the default and
  `createGrantListPolicy` for deterministic per-extension allow-lists;
- `CapabilityProvider` for host-side implementations; a provider that throws
  still produces a structured response.

## Boundaries

The package depends only on `@blastlauncher/protocol`. It must not depend on
Electron, Node.js APIs, React, or a concrete transport; operating-system
providers live outside this package.
