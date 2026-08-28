# `@blastlauncher/raycast-compat`

Measured Raycast API compatibility adapter for Blast V2 (ADR 0011).

The package maps the census-justified subset of the `@raycast/api` surface
onto the V2 scene contract, renderer, and capability broker:

- `List`, `List.Item`, `ActionPanel`, `Action`, `Action.CopyToClipboard`, and
  `Detail` render through `@blastlauncher/react-renderer`;
- `Icon` ships a measured kebab-case subset serialized into scene `icon`
  properties;
- `Clipboard.copy`/`Clipboard.read` route through the capability broker with
  the command identity attached by the host;
- `runCommand(context, component)` binds the API to the running command and
  routes scene events back to component callbacks; the Node bootstrap's
  `configureApi` hook calls `configureRaycastCompat` before the command runs.

## Compatibility boundary

Unmeasured surface (shortcuts, object icons and `Color` tinting, `Form`,
toasts, navigation, preferences) raises a structured `CompatibilityError`
with code `unsupported_api`; it never fails silently. The surface grows in
census order as fixtures are measured. Resolution of literal `@raycast/api`
imports to this adapter happens at the runtime layer when extension bundling
lands.

## Boundaries

The adapter depends only on React, the scene contract, and the React
renderer. It must not depend on core, hosts, transports, Node-only APIs, or
Electron.
