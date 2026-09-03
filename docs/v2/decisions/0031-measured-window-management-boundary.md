# ADR 0031: Measured WindowManagement boundary

- Status: accepted
- Date: 2026-08-29

## Context

The pinned Raycast declaration exposes `WindowManagement` as a namespace with
three read operations (`getActiveWindow`, `getWindowsOnActiveDesktop`, and
`getDesktops`) plus `setWindowBounds`. The corpus contains three extensions
using this namespace: `bento-window`, `raycast-port`, and `window-layouts`.

The V2 capability protocol permits only primitive argument and result values.
Window and desktop records therefore need an explicit JSON representation, and
operating-system window enumeration and mutation must remain outside the
extension process.

## Decision

- Export the measured official `WindowManagement.Window`, `WindowManagement.Desktop`,
  and `WindowManagement.DesktopType` shapes from the compatibility adapter.
- Route discovery through `window-management.getActiveWindow`,
  `window-management.getWindowsOnActiveDesktop`, and
  `window-management.getDesktops`; decode and validate the JSON response before
  returning it to extension code.
- Route `setWindowBounds` through `window-management.setWindowBounds`, encoding
  the validated options as `optionsJSON`. Reject malformed IDs, bounds, desktop
  IDs, fullscreen combinations, and non-finite coordinates or dimensions at the
  adapter boundary.
- Keep host permission and consent state separate from the adapter. The default
  environment remains deny-by-default for `canAccess`, while a host that grants
  the capability may execute the explicit operations through its provider.
- Add deterministic unit, vertical-slice, matrix, and corpus-probe coverage;
  use fixture providers for results and mutation acknowledgement, not OS window
  access.

## Consequences

The named `WindowManagement` static blocker is removed from the corpus probe,
and `window-layouts` now renders through the measured boundary. The adapter can
be used by extensions that receive an explicit host grant, while the production
window provider, permission UI, and OS-specific bounds implementation remain
client work. Dynamic and namespace imports plus the small legacy alias tail are
now the next static compatibility targets.
