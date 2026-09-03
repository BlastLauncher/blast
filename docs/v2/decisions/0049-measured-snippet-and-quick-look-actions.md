# ADR 0049: Measure snippet creation and Quick Look actions

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus uses `Action.CreateSnippet` in 24 source files and
`Action.ToggleQuickLook` in 34. The selected sources use the official snippet
shape `{ text, name?, keyword? }`, while List and Grid items carry Quick Look
metadata as `{ path, name? }`. These actions were previously exposed as
unmeasured nested members even though their intent can be represented by
existing action nodes and primitive capability arguments.

## Decision

- Render `Action.CreateSnippet` through the generic action scene node. Validate
  `text`, `name`, and `keyword` as strings, preserve empty strings, encode the
  selected fields as `snippetJSON`, and send them through the explicit
  `snippet.create` capability.
- Render `Action.ToggleQuickLook` through the generic action scene node with
  Raycast's measured default title and icon. Its activation requests the
  explicit `quick-look.toggle` capability without extension-supplied path
  arguments; the host resolves the currently selected item's preview metadata.
- Accept List and Grid `quickLook` metadata at render time. Normalize its
  structural `PathLike` path into `quickLookPath`, preserve a non-null string
  name as `quickLookName`, and omit a null or absent name.
- Add the observed `Icon.Snippets` member with its declared `snippets-16` value;
  unknown icon members remain unsupported.

Both operations remain deny-by-default capability requests. The host owns
snippet storage/navigation, Quick Look presentation, selected-item handling,
native authorization, and platform-specific UI.

## Consequences

- Extensions that use these measured action components can publish their
  scenes without introducing a new scene node or transport message.
- `quickLookPath` and `quickLookName` are durable, whitelisted scene properties
  for List and Grid item consumers.
- Invalid snippet fields, paths, and names fail as structured compatibility
  errors; no malformed host intent is silently dropped.
- Focused adapter and scene tests cover serialization and capability routing.
  The canonical corpus aggregate remained at 1,324 rendered extensions in this
  slice, so no coverage lift is claimed from nondeterministic process outcomes.
