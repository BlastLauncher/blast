# ADR 0055: Complete measured declaration utility namespaces

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast declaration exposes utility types through namespaces as
well as through the runtime values: `Alert.Options`, `Alert.ActionOptions`,
`Cache.Options`/`Subscriber`/`Subscription`, `Toast.Options`/`ActionOptions`/
`Style`, and `Form.ItemReference`. The adapter already implemented the
corresponding runtime behavior and several nested component `Props` aliases,
but these utility names were absent or only available through flat internal
aliases. That left otherwise compatible TypeScript extensions with declaration
errors.

The pinned declaration also gives `Toast.Style` uppercase enum values. The
adapter's scene contract intentionally uses lower-case styles, so its
normalizer can preserve the public values while translating at the scene edge.

## Decision

- Merge declaration-shaped `Alert`, `Cache`, `Form`, and `Toast` namespaces
  with the existing runtime exports and expose the measured option, callback,
  style, and item-reference aliases.
- Export the `FormItemRef` handle shape at the top level and expose it as
  `Form.ItemReference`. The declaration-level handle is completed here;
  runtime handle attachment is covered separately by ADR 0056, while actual
  focus/reset execution waits for a host-facing form-control boundary.
- Use Raycast's uppercase values for the runtime `Toast.Style` constants and
  continue normalizing both uppercase and lower-case inputs to the lower-case
  scene style.
- Keep the existing flat aliases and legacy constants so older sources do not
  need a migration.

## Consequences

- Raycast-style TypeScript consumers can use the measured namespace spellings
  without changing their source or importing implementation aliases.
- No protocol, scene schema, capability, or host provider changes are needed
  for this declaration-only slice.
- A later form-control decision must define how `focus()` and `reset()` cross
  the runtime/client boundary before those no-op methods gain host behavior.

---
