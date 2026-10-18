# ADR 0022: Measured Grid, menu-bar, and command-launch compatibility

- Status: accepted
- Date: 2026-08-29

## Context

The post-launch-boundary corpus probe still listed `Grid` (292 extensions),
`launchCommand` (291), and `MenuBarExtra` (269) as the dominant static API
blockers. Their common shapes are sufficiently stable to measure together:
Grid is a content-tile scene, MenuBarExtra is a menu tree, and command launching
is an imperative host request. Menu-bar commands were also excluded from the
probe's render denominator even though their output has a distinct semantic
root.

## Decision

- Add `grid` scene roots with content items, sections, empty views, search-bar
  dropdowns, layout properties, and action groups. Grid content is normalized
  to a string source or a `color:` descriptor; theme-aware values resolve to
  the light value until theme-aware scene properties are introduced.
- Add `menu-bar-extra` scene roots with items, sections, submenus, separators,
  shortcuts, and item action callbacks. The current event boundary reports
  deterministic `left-click` actions; alternate items and right-click identity
  remain outside this slice.
- Select a `menu-bar` command when an extension has no view or unspecified-mode
  command, and count it as renderable against the same corpus probe.
- Route `launchCommand` through `command.launch`. The primitive-only capability
  contract carries JSON-serializable `arguments` and `context` as
  `argumentsJSON` and `contextJSON`; the host/client remains responsible for
  resolving the target command and starting its process.
- Keep all three boundaries deny-by-default in production. The corpus probe
  and fixtures use explicit no-op providers and grants only to measure scene
  and request shape.

## Consequences

- Raycast-style Grid and menu-bar components can cross the existing runtime and
  scene pipeline without importing Electron or Node APIs into the adapter.
- The probe now measures menu-bar commands and reports the next blockers after
  rendering 437/3,231 extensions (13.53%) at the pinned corpus revision.
- Command launches are observable and policy-controlled, but do not yet start
  a second command. Target resolution, launch-props propagation, and process
  orchestration are follow-up host/client work.
