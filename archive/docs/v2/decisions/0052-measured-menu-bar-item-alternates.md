# ADR 0052: Measure menu-bar item alternates

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus uses `MenuBarExtra.Item.alternate` in multiple
extensions. The adapter already exposed the declaration-shaped property and
the `MenuBarExtra.ActionEvent` union, but rejected every alternate item and
always emitted `left-click` for the primary callback. That left a clear,
measured part of the menu-bar API outside the scene contract.

## Decision

- Represent an alternate item as a nested `menu-bar-item` scene node below its
  primary item. Mark the nested node with the internal boolean `isAlternate`
  property so a client can distinguish it from an ordinary item.
- Preserve the primary callback's `{ type: "left-click" }` event and invoke an
  alternate callback with `{ type: "right-click" }`.
- Use a React context boundary while rendering the alternate element. This
  preserves the semantic marker and event identity through direct items,
  fragments, and custom components that resolve to `MenuBarExtra.Item`.
- Keep alternate-item presentation, native context-menu behavior, and the
  mapping of right-click gestures to scene events as client responsibilities.
  The scene contract only carries the durable item relationship and callback
  identity.

## Consequences

- Declaration-backed menu-bar alternates no longer fail at the adapter edge.
- Alternate callbacks remain transport-neutral and are independently routed by
  the existing scene event mechanism.
- The scene contract now allows a `menu-bar-item` child under a
  `menu-bar-item`; adapter-produced alternates are marked, while clients may
  reject unmarked nested items if their native UI does not support them.
- Focused adapter, scene, and real child-process fixture tests cover the
  behavior. Native alternate rendering is intentionally not claimed by this
  slice.

---
