# ADR 0053: Preserve zero pagination page sizes

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast declaration types `List` and `Grid` pagination
`pageSize` as a `number` without a positive-value constraint. The corpus
extension `modrinth-search/search-projects` forwards the `useFetch` pagination
value as `pagination?.pageSize ?? 0`. During the initial render, that
declaration-shaped fallback reached the adapter and was rejected by the
positive-only Grid-column validator, producing a structured compatibility
failure before the list scene was published.

## Decision

- Validate pagination page sizes as non-negative safe integers and preserve
  the value unchanged in the scene (`0` included).
- Keep List/Grid column counts on the separate positive safe-integer rule;
  this decision only changes the pagination field.
- Continue rejecting negative, fractional, unsafe, `NaN`, and infinite page
  sizes, as well as malformed pagination objects, flags, and callbacks.

## Consequences

- Async hooks that expose an initial zero page-size fallback can publish their
  List or Grid scene without an adapter-specific failure.
- The client receives the exact pagination value and remains responsible for
  deciding how zero loading placeholders should be presented.
- A targeted reprobe of `modrinth-search/search-projects` now renders
  end-to-end; the aggregate corpus reprobe records the remaining outcomes
  separately from process and dependency variance.

---
