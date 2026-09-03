# ADR 0041: Measured icon members

- Status: accepted
- Date: 2026-08-29

## Context

The pre-slice corpus refresh left 46 structured compatibility failures. Focused
diagnostics showed that 18 of them reached the icon serializer with an undefined
source because the compatibility adapter's measured `Icon` object did not yet
contain the named member used by the extension. The pinned Raycast declaration
has a substantially larger enum, while the V2 adapter intentionally publishes a
measured subset.

## Decision

- Add the named `Icon` members observed while profiling those 18 renderable
  commands, using the adapter's existing semantic kebab-case scene identifiers.
- Keep the `Icon` export explicit and measured; unknown members must not resolve
  through a permissive fallback.
- Preserve the existing icon serializer and scene contract. This slice adds
  enum availability only; image URLs, masks, tint colors, and client asset
  mapping remain separate boundaries.

## Consequences

The selected corpus commands can render their existing icon choices instead of
failing because a known Raycast enum member is absent. The slice adds the
observed list, form, grid, menu-bar, numbered, progress, disabled, and
formatting members; future icon members remain visible as structured
compatibility gaps until measured, and the adapter tests assert both the newly
available values and the explicit subset boundary.
