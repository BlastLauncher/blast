# ADR 0032: Measured legacy aliases and list/render bridges

- Status: accepted
- Date: 2026-08-29

## Context

The pinned Raycast declaration and corpus census leave a small static tail
after the main view and capability slices: `ActionPanelItem`,
`AlertActionStyle`, `ArgumentsLaunchProps`, `FormItemRef`, `ItemProps`,
`ListSection`, `OpenWithAction`, and `render`. Most are aliases or type-only
names, but `ListSection` and `render` need an execution boundary so imports do
not become misleading compatibility claims. `OpenWithAction` also needs to
express application-chooser intent across the primitive-only host boundary.

## Decision

- Export `ActionPanelItem` as the measured `Action` component and
  `AlertActionStyle` as `Alert.ActionStyle`; expose the legacy launch, form-ref,
  and item-props type names without adding a new capability.
- Add `list-section` to the semantic scene vocabulary with optional `id`,
  `title`, and `subtitle` properties. `List.Section` and `ListSection` accept
  `List.Item` children, and the scene validator enforces that parent-child
  relationship.
- Implement `Action.OpenWith` and `OpenWithAction` with the official default
  title/icon and route activation through `open.open` with a primitive
  `openWith: true` flag. The host remains responsible for presenting the
  application chooser and opening the selected application.
- Implement legacy `render(<Command />)` as a bridge to the active renderer.
  Calls made during the initial React render are queued until the reconciler
  exits render phase; later calls replace the navigation host with a fresh
  scene root. Calling it outside a running command remains a structured
  compatibility error.
- Add unit, renderer, matrix, and corpus-probe coverage for the aliases and
  bridge. Keep the compatibility adapter independent of host, transport,
  process, and Electron code.

## Consequences

The remaining named small legacy aliases leave the static blocker list, while
the new list-section node gives section titles a durable semantic representation
instead of flattening them. The host must eventually implement the chooser-aware
`open.open` argument and clients must render list sections. Dynamic imports,
namespace imports, and the other measured API gaps remain separate work.
