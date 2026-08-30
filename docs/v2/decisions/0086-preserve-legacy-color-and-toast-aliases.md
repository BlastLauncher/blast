# ADR 0086: Preserve measured legacy color and toast aliases

- Status: Accepted
- Date: 2026-08-30

## Context

The binding-aware audit of the pinned Raycast extension corpus found two
runtime constant names that are not present in the pinned declaration but are
still referenced by extension code:

- one `Color.Gray` access in `schoology`, where `Color` is imported from
  `@raycast/api`;
- one `Toast.Style.SuccessMessage` access in `raycast-arcade`, where `Toast`
  is imported from `@raycast/api`.

The current adapter already retains measured legacy `Color.Pink` and
`Color.Brown` raw aliases. The audit also found five `Color.Grey` references in
`anytype`, but those are bound to an extension-owned model enum rather than the
Raycast API and must not expand the compatibility surface.

## Decision

- Add `Color.Gray` as the raw CSS color keyword `"gray"`.
- Add `Toast.Style.SuccessMessage` as an identity alias of
  `Toast.Style.Success` (`"SUCCESS"`).
- Keep the aliases adapter-local: they require no scene property, transport
  message, capability, or client change.
- Do not add `Color.Grey`, `Toast.Style.FailureMessage`, or other speculative
  names without a binding-aware corpus observation.

## Boundary

These are explicit legacy constants, not an open property fallback. `Color.Gray`
uses the existing `Color.Raw` path and therefore preserves a primitive string
through the same icon tint serialization already used by other raw colors.
`SuccessMessage` normalizes through the existing toast style handling.

## Evidence

- The pinned declaration exposes the standard `Color` enum but no `Gray` or
  `Grey` member.
- The pinned declaration exposes `Toast.Style.Success`, `Failure`, and
  `Animated`, but no `SuccessMessage` member.
- The corpus audit resolves imported bindings before counting members, leaving
  exactly one API-bound use for each alias above.

## Consequences

Two otherwise measurable legacy command paths retain their declared runtime
behavior without weakening unknown-member rejection or widening any host
contract. The aliases remain intentionally narrow and can be removed only as
part of an explicit compatibility policy change.

## Verification

- The adapter suite passes 94/94 tests, including both constant aliases,
  `Color.Gray` rendered through an icon tint, and
  `Toast.Style.SuccessMessage` normalized through a `Toast` instance.
- The focused corpus probe reports no static unsupported API imports for either
  source extension: `raycast-arcade` renders, while `schoology` reaches the
  existing `dependency_unavailable` boundary.
- The full V2 suite passes across 17 packages, including all 41 end-to-end
  fixtures, and the formatter check passes.
- Aggregate corpus counters remain unchanged because this is an adapter-only
  constant slice.
