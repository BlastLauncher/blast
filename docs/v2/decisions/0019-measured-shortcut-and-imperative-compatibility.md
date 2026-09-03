# ADR 0019: Measured shortcut and imperative compatibility boundary

- Status: accepted
- Date: 2026-08-28

## Context

The corpus probe showed that shortcut objects and a small group of imperative
APIs were common blockers after the first component, form, and toast slices.
These APIs need platform or desktop behavior, but the compatibility adapter
must remain independent of Electron and operating-system APIs.

## Decision

- Normalize Raycast shortcut unions at the adapter boundary into the scene
  value `{ modifiers: string[], key: string }`. Platform-specific `macOS`,
  `Windows`, and legacy lowercase `windows` forms are selected using the
  configured runtime platform. The scene contract carries the structured
  value so clients can render their own shortcut labels.
- Accept shortcut, style, and `autoFocus` properties on actions and action
  groups where the measured Raycast surface exposes them. Toast action
  shortcuts use the same normalized scene value.
- Route `showHUD`, `open`, and `confirmAlert` through explicit capability
  requests: `hud.show`, `open.open`, and `alert.confirm`. Arguments remain
  primitive wire values. `confirmAlert` requires a boolean provider result and
  invokes the selected action callback in the extension process.
- Expose `Alert.ActionStyle`, `Action.Style`, `Keyboard.Shortcut.Common`, and
  `PopToRootType` constants for the measured source shape. Placeholder exports
  for broader utility-package imports still raise a structured error when
  called and do not count as supported APIs.
- Implement `Cache` as a synchronous, UTF-8 byte-counted LRU fallback. Cache
  state is namespaced by extension and cache namespace in the runtime realm;
  `storageDirectory` is a stable compatibility value until a persistent cache
  capability exists.

The production capability broker remains deny-by-default. The corpus probe
uses only deterministic in-memory providers for the three new imperative
capabilities.

## Consequences

- Clients receive enough structure to render shortcuts consistently across
  platforms without parsing display strings.
- Desktop behavior, user consent, and persistent cache storage remain host
  responsibilities and can be added without changing the adapter API.
- The adapter's direct tests cover normalization, capability payloads and
  responses, callbacks, cache eviction, and session-local namespacing.
- Form focus/blur, desktop navigation functions, and other unmeasured APIs
  remain explicit compatibility errors.
