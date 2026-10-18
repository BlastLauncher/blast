# ADR 0113: Present V2 action-panel submenus

- Status: Accepted
- Date: 2026-08-31

## Context

The compatibility adapter already preserves the measured
`ActionPanel.Submenu` lifecycle: title, icon, shortcut, loading state, local
filtering metadata, search callbacks, lazy-open callbacks, and autofocus
intent. The V2 client currently renders every `action-group` as a flat row of
buttons, so a submenu cannot be opened or searched as a submenu. Groups with
no optional metadata are also indistinguishable from ordinary action-panel
sections at the client edge.

The next action-helper slice should improve the application boundary without
claiming native action-panel or operating-system provider support.

## Decision

The adapter will mark `ActionPanel.Submenu` groups with an internal semantic
`isSubmenu` scene property. The V2 client will present those groups as an
accessible expandable disclosure with:

- title, icon, shortcut, and loading presentation;
- an open/close lifecycle that invokes the validated `onOpen` event when the
  submenu opens;
- a search field when the measured search callback is present or local
  filtering is enabled;
- deterministic title filtering of nested actions while preserving source
  order; and
- autofocus behavior that focuses the submenu entry when requested.

The default filtering rule remains Raycast-shaped: a submenu with no search
callback filters locally, while a search callback opts into extension-owned
filtering unless `filtering: true` is supplied. Search callbacks continue to
cross the existing `scene.event` bridge. Empty groups and nested submenus
remain valid and render without a synthetic action.

## Boundary

This is client presentation and event dispatch over the existing scene
contract. It does not add protocol messages, capability operations, native
application selection, Quick Look, or OS-level action providers. Other action
helpers continue to execute through their existing host-owned capability
boundaries.

## Consequences

Extensions using measured action-panel submenus can expose lazy content and
searchable action groups in the V2 window. The semantic marker makes the
presentation unambiguous even when a submenu has only a title and children.
Filtering remains deterministic and intentionally does not reproduce Raycast's
native ranking algorithm.

## Verification

- server-render ordinary groups and submenus without flattening the latter;
- test local filtering, custom search callbacks, loading, and open lifecycle;
- test nested actions and empty submenu output;
- type-check and Forge-bundle the Electron client; and
- keep the full V2, format, and lint gates green.
