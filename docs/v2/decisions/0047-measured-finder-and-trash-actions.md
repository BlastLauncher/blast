# ADR 0047: Measure Finder and trash action components

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus uses `Action.ShowInFinder` in 236 source files and
`Action.Trash` in 25. Blast already had the corresponding top-level
`showInFinder` and `trash` helpers, including `finder.show` and
`filesystem.trash` capability boundaries, but the action components were not
available to action-group validation.

## Decision

- Render `Action.ShowInFinder` and `Action.Trash` through the existing generic
  action scene node.
- Validate each `PathLike` at render time and send only normalized primitive
  paths to `finder.show` or `filesystem.trash` when the action is activated.
- Invoke `onShow` or `onTrash` only after the host reports a successful
  capability response.
- Expose `ShowInFinderAction` and `TrashAction` as identity-preserving
  deprecated aliases, and include both components in measured action-child
  validation.

The operations remain deny-by-default capability requests. The host owns
Finder integration, filesystem authorization, destructive-operation consent,
and platform-specific native titles.

## Consequences

- Extensions using these high-usage action components can publish scenes
  without a new scene node or transport message.
- Path-like strings, URLs, and byte values share the existing normalization and
  validation policy used by the imperative helpers.
- Invalid paths and callbacks remain structured compatibility errors; no
  invalid filesystem intent is silently dropped.
- Adapter tests cover rendering, capability arguments, callbacks, and alias
  identity. Production providers and consent UI remain host work.
