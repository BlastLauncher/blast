# ADR 0051: Declaration-backed Icon and collection API

- Status: accepted
- Date: 2026-08-29

## Context

The compatibility effort had been adding Raycast API members one observed
failure at a time. That approach left the `Icon` object smaller than the pinned
Raycast declaration and left several related collection behaviors split across
the adapter, renderer, and scene contract. The corpus census and local
declaration are sufficiently clear for this surface to be implemented as one
compatibility boundary.

## Decision

- Mirror all 478 members of the pinned `@raycast/api` `Icon` declaration in the
  adapter. Keep the object explicit so unknown names remain visible as
  structured compatibility failures, and retain older corpus names as
  deliberate legacy aliases. Match the related `Image`, `FileIcon`,
  `ImageLike`, and `ImageSource` declaration shapes, including theme-aware
  sources, fallbacks, masks, and `ColorLike` tint values.
- Treat `List.Dropdown` and `Grid.Dropdown` as the same Raycast search-accessory
  contract. Both may be used under either view root, while item and section
  children remain validated by the semantic scene contract.
- Publish List and Grid search/filter/selection/pagination behavior as
  whitelisted scene properties and event IDs. Add the corresponding
  `Form.Dropdown` and `ActionPanel.Submenu` search lifecycles, including
  loading, throttling, lazy open, and deprecated identifiers where the pinned
  declaration exposes them.
- Use Raycast's `raycast-*` identifiers for built-in `Color` values. Preserve
  the older raw `Pink` and `Brown` values because they remain in the public
  corpus.
- Keep Clipboard `read`, `readText`, and `clear` on explicit capability
  operations. Decode the official structured `{ text }` response while
  retaining plain-string and empty-response compatibility.
- Match the declaration's nested `Props` namespaces for the measured
  `Action`, `ActionPanel`, `List`, `Grid`, `Form`, and `MenuBarExtra` surfaces.
  Preserve the official aliases, `Action.InstallMCPServer`, and
  `captureMemorySnapshot`; bind `Cache.subscribe` so it is safe to pass to
  React external-store hooks.
- Coalesce nested renderer removals before publishing mutation operations. A
  deleted subtree is represented by its attached root removal, preventing
  stale child updates and inserts from reaching a client-side scene buffer.

## Consequences

The adapter now covers the declaration-backed Icon surface and the highest-value
collection behaviors as a coherent slice. The canonical probe at the pinned
corpus revision renders 1,814 of 3,231 extensions (56.14%), or 1,814 of 2,915
selected renderable commands (62.23%). The remaining failures are dominated by
third-party dependency availability and host/process setup rather than missing
members from this API slice. The static `fetch` gap recorded at the time was
later addressed by ADR 0089.

This decision extends the measured icon work in ADR 0041. It does not make the
desktop client responsible for icon assets, native masks, dropdown presentation,
or host capabilities; those remain downstream client and provider concerns.
