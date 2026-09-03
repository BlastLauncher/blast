# ADR 0021: Measured launch-boundary compatibility

- Status: accepted
- Date: 2026-08-29

## Context

The corpus probe showed that `LaunchProps`, `closeMainWindow`, `popToRoot`,
`openExtensionPreferences`, and `Image` were the dominant remaining static
blockers after the shortcut, imperative, cache, and dependency-policy slices.
The first three desktop functions require host behavior, while `LaunchProps`
and image masks are command-facing values that should not pull Electron or
Node-only code into the compatibility adapter.

## Decision

- The Raycast adapter injects `LaunchProps` into default-exported command
  components. The current launcher supplies a deterministic user-initiated
  launch with an empty argument map; the `runCommand` boundary accepts an
  explicit launch-props object for fixtures and future command-launch plumbing.
- `LaunchType` exposes Raycast's `UserInitiated` and `Background` values, and
  `environment().launchType` reflects the active launch props.
- `Image.Mask.Circle` and `Image.Mask.RoundedRectangle` are available as
  runtime namespace constants. The current scene contract resolves
  theme-aware image sources to their light source and validates masks while
  theme-aware scene values remain future work.
- `closeMainWindow`, `popToRoot`, and `openExtensionPreferences` use explicit
  `window.close`, `navigation.popToRoot`, and `preferences.openExtension`
  capability requests. Their arguments remain primitive wire values, and the
  production broker remains deny-by-default.
- The corpus probe uses deterministic no-op providers for these capabilities;
  this does not imply that a production client has granted desktop access.

## Consequences

- Raycast-style default components can safely read launch props during their
  first render, and common image-mask imports no longer fail module loading.
- Desktop behavior stays outside the adapter and can be implemented by a
  client without changing the extension runtime or scene contract.
- Explicit programmatic launch inputs, persistent host preferences, and
  theme-aware image scene values remain separate follow-up boundaries.
- The corpus probe increased end-to-end renders from 243 to 365 at the pinned
  revision; the next measured group is `Grid`, `launchCommand`, and
  `MenuBarExtra`.
