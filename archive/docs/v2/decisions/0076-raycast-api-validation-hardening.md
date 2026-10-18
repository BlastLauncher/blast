# ADR 0076: Raycast API validation hardening

- Status: Accepted
- Date: 2026-08-30

## Context

The API-first audit in [ADR 0075](./0075-raycast-api-first-compatibility-plan.md)
found that the remaining measured work is primarily semantic fidelity rather
than another missing top-level export. Two declaration-backed rules were
implemented in the adapter but were not enforced at the compatibility boundary:
Raycast Grid column counts are limited to one through eight, and browser content
requests cannot combine a CSS selector with markdown output.

These are adapter-owned validations. They do not require a new scene node,
client provider, dependency, native module, or platform-specific behavior.

## Decision

- Validate `Grid` and `Grid.Section` `columns` values as safe integers in the
  inclusive range `1..8`.
- Reject `BrowserExtension.getContent({ format: "markdown", cssSelector })`
  with a structured `unsupported_api` compatibility error before the request
  reaches the host capability broker.
- Keep the existing normalized wire shapes for valid values and keep host
  browser content retrieval separate from API option validation.
- Cover both boundaries with deterministic adapter tests and document the
  validated behavior in the package README.

## Evidence

The focused `@blastlauncher/raycast-compat` test suite passes all 83 tests,
including root and section Grid boundary cases and the markdown/CSS-selector
exclusion. The full corpus counters are unchanged by design: the new checks
reject invalid option combinations and out-of-range values rather than making
previously unavailable dependencies or host providers executable.

## Consequences

- Extensions receive an early structured compatibility diagnostic for these
  invalid Raycast option shapes instead of a later scene or host failure.
- Valid Grid layouts now match the declared Raycast range, including both
  boundary values.
- The API-first implementation can continue with other adapter-owned semantic
  gaps before the dependency vendor frontier is revisited.
- Browser-extension host capability policy, including permission and content
  retrieval behavior, remains outside this slice.
