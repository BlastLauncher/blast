# ADR 0017: Toast lifecycle and action events

- Status: accepted
- Date: 2026-08-28

## Context

The initial toast boundary supported only one-way display payloads. Real
fixtures use `Toast.Style.Animated`, retain the returned `Toast`, mutate its
fields while work is in progress, and call `Toast.hide()`. Toast actions also
need a callback path, but toast state is ephemeral and does not belong in the
scene tree.

## Decision

- Keep `ui.toast` outside the scene tree and preserve the legacy show shape:
  an omitted operation means `show`, and a show payload can omit `toastId` for
  compatibility. Identified payloads use `show`, `update`, and `hide`; update
  and hide require a non-empty `toastId`, and show/update require a title.
- The compatibility adapter allocates stable toast IDs and emits the current
  title, message, style, and optional primary/secondary action on each show or
  update. The measured style set includes `success`, `failure`, and
  `animated`; unknown styles retain the existing neutral normalization.
- Toast action payloads contain a display title and an opaque event ID.
  Action events reuse the validated `scene.event` channel and invoke the
  corresponding callback with its `Toast` instance. Hiding a toast releases
  its action event handlers.
- `Toast.show()` sends show once and update thereafter; mutable title,
  message, style, and action properties queue updates while shown.
  `Toast.hide()` sends an idempotent hide operation, and the legacy
  `showToast(style, title, message?)` overload is supported.
- Timing, stacking, animation rendering, and other client presentation
  policy remain outside this wire contract. Shortcut objects on toast actions
  remain an explicit structured compatibility error.

## Consequences

- Extensions can run the measured asynchronous toast patterns used by the
  corpus without stacking a new toast for every mutation or retaining dead
  action callbacks.
- The core relay and scene boundary validate and forward lifecycle payloads
  without coupling the transport-neutral scene model to a client toolkit.
- A desktop client still needs a toast store and presentation policy; those
  concerns can consume the stable ID and operation fields without changing
  the extension/runtime contract.
