# ADR 0075: Raycast API-first compatibility plan

- Status: Accepted
- Date: 2026-08-30

## Context

The current corpus probe renders 2,090 of 3,231 extensions (64.69%), or
2,090 of 2,915 extensions with a selected renderable command (71.70%). Those
are end-to-end outcomes, not a pure Raycast API score: the result also includes
dependency resolution, command startup, renderability, and host capability
boundaries. The latest run separately records 573 third-party dependency
failures, 249 process/startup failures, 316 non-renderable commands, and three
missing entrypoints.

The declaration-backed API import audit is clean for the measured corpus except
for the intentionally host-policy-bound `fetch` import. That audit does not
prove that every exported API behavior or lifecycle semantic is complete. The
adapter still documents measured gaps in client feedback, desktop behavior,
action helpers, and additional Tool/browser behavior. The measurement host is
ARM64 Linux, and disk space is intentionally being conserved.

## Decision

Finish Raycast API semantics before expanding the dependency vendor frontier.
Track compatibility in three separate categories:

1. **Raycast API semantics:** exported values, component behavior, callbacks,
   event payloads, validation, serialization, and structured compatibility
   errors. This is the current implementation priority.
2. **Dependency and platform provisioning:** whether an extension's own npm
   graph can be resolved in the probe. This remains measurement input and must
   not be presented as API coverage.
3. **Host capabilities and renderability:** OS providers, consent, network,
   process behavior, native modules, and command modes outside the scene
   contract. These remain explicit runtime boundaries.

The next implementation slice will select the highest-yield remaining measured
API semantic, add deterministic adapter and fixture coverage, run a focused
probe, and then refresh the full support matrix. After the API slice is
exhausted, only small, exact-version, portable JavaScript dependencies may be
considered. Native/macOS packages, WASM packages, test-only packages, large
graphs, and host-process packages stay deferred unless a separate policy
decision authorizes them. Extension authors remain responsible for whether
their third-party native dependencies support the target platform; Blast does
not silently install or emulate those modules.

`fetch` remains outside the adapter until a host network capability defines URL
policy, consent, response limits, and deterministic tests.

## Consequences

- A higher end-to-end score will represent actual API progress only when the
  dependency/platform and host-boundary counters are read alongside it.
- Every API slice must leave a deterministic test and a documented support
  boundary, including a structured error where the host contract is not yet
  available.
- ARM64 Linux and the current disk budget remain first-class constraints for
  corpus measurement; platform-specific dependency failures are not treated as
  missing Raycast API members.
- The next status update should report the API slice separately from any later
  portable dependency seed.
