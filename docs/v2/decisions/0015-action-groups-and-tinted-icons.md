# ADR 0015: Action groups and tinted icons

- Status: accepted
- Date: 2026-08-28

## Context

The support matrix named `ActionPanel.title`, submenus, and tinted icons as
the dominant structured blockers after navigation and storage: extensions
failed at render on panel titles, `ActionPanel.Submenu`, and object icons
with tint colors, and `Color` appeared in 40.1% of corpus extensions.

## Decision

- The scene contract grows an `action-group` node type: optional `title`,
  children are actions and nested groups. `list-item` and `list` accept
  action groups as children, so item panels, submenus, and List-level action
  panels share one representation. `ActionPanel` renders this node (it is no
  longer transparent), and `ActionPanel.Submenu` renders a nested group.
- Icon serialization accepts object icons: `{ source, tintColor }` maps to
  the scene `icon` and the new `iconTintColor` string property on
  `list-item` and `action`; `Color` ships as a measured kebab-case subset.
  Unknown tint values and non-string sources raise structured errors.
- The `actions` prop on `List` maps to an action-group child of the list,
  replacing the previous compatibility error.

## Consequences

- the matrix's dominant structured blockers are resolved; `big-o` moved from
  expected failure to rendering, and corpus renders rose from 15 to 16;
- clients receive grouping information for action pickers, which the
  deterministic test client asserts and the desktop client will render;
- this leaves client toast timing/stacking, richer Form controls, and shortcut
  objects as the next UI increments; the measured Form subset reuses the same
  action-group representation for its submit actions, while toast lifecycle
  semantics are defined separately in ADR 0017.
