# `@blastlauncher/raycast-compat`

Measured Raycast API compatibility adapter for Blast V2 (ADR 0011).

The package maps the census-justified subset of the `@raycast/api` surface
onto the V2 scene contract, renderer, and capability broker:

- `List`, `List.Item`, `ActionPanel`, `Action`, `Action.CopyToClipboard`, and
  `Action.SubmitForm`, `ActionPanel.Section`, and `Detail` render through
  `@blastlauncher/react-renderer`;
- `Form` covers text fields, text areas, password fields, checkboxes,
  dropdowns, date pickers, tag pickers, file pickers, descriptions, separators,
  dropdown sections/items, and tag items;
- `Icon` ships a measured kebab-case subset serialized into scene `icon`
  properties, including object-icon tint colors;
- `Clipboard.copy`/`Clipboard.read` route through the capability broker with
  the command identity attached by the host;
- `showToast` and `Toast` support legacy show overloads, animated/success/
  failure styles, identified show/update/hide lifecycle messages, mutable
  toast fields, and primary/secondary actions routed through scene events;
- `runCommand(context, component)` binds the API to the running command and
  routes scene events back to component callbacks; the Node bootstrap's
  `configureApi` hook calls `configureRaycastCompat` before the command runs.

Form changes and submissions use validated `scene.event` values. The adapter
keeps uncontrolled defaults and client-provided values together and filters
submitted values to the current form field IDs. `DatePicker` values are native
`Date | null` values in the adapter and ISO strings on the scene wire;
`TagPicker` and `FilePicker` values are string arrays (file values are paths).

## Compatibility boundary

Unmeasured surface (action and toast-action shortcut objects, client toast
timing/stacking, and focus/blur form callbacks) raises a structured
`CompatibilityError` with code `unsupported_api`; it never fails silently.
Resolution of literal
`@raycast/api` imports to this adapter happens at the runtime layer when
extension bundling lands.

## Boundaries

The adapter depends only on React, the scene contract, and the React
renderer. It must not depend on core, hosts, transports, Node-only APIs, or
Electron.
