# ADR 0099: Render menu-bar scenes in the opt-in Electron client

- Status: Accepted
- Date: 2026-08-31

## Context

The measured Raycast compatibility adapter and scene contract already preserve
`MenuBarExtra` roots, items, sections, submenus, separators, shortcuts, and
alternate items. ADR 0052 leaves the alternate item's right-click mapping to
the client. The opt-in Electron renderer currently supports list, grid, detail,
and form roots but reports `menu-bar-extra` as unsupported, so menu-bar
commands cannot use the semantic client path.

## Decision

Add a bounded `menu-bar-extra` presentation to the opt-in V2 renderer:

- render the root title, tooltip, icon, and loading state in a compact menu
  surface;
- render items as keyboard-accessible buttons, sections as labeled groups,
  submenus as native expandable `details` controls, and separators as semantic
  rules;
- route a normal item click to its `onAction` event with `{ type:
"left-click" }` and, when a marked alternate child exists, route the item's
  context-menu gesture to that alternate event with `{ type: "right-click" }`;
- show structured keyboard shortcuts without changing the scene wire shape;
- ignore only malformed/unexpected children that cannot be produced by the
  validated scene contract; and
- keep the renderer opt-in and leave native OS menu-bar registration,
  background menu-bar lifecycle, and packaged bootstrap policy to later
  boundaries.

## Boundary

This makes the existing menu-bar scene executable in the Electron V2 client.
It does not claim an OS status-item implementation: the surface is rendered in
the current command window, and all actions still cross the existing semantic
scene-event bridge.

## Consequences

Menu-bar commands selected by the trusted catalog no longer stop at the
renderer's unsupported-scene fallback. Alternate actions have a deterministic
client gesture, while the contract remains transport-neutral and no Electron
or operating-system API enters the scene package.

## Verification

- exercise menu-bar markup through a deterministic server-render smoke test;
- type-check and Forge-bundle the Electron app for Linux/arm64;
- keep the full V2 and compatibility suites green; and
- preserve list, grid, detail, form, external-daemon, and V1 fallback modes.
