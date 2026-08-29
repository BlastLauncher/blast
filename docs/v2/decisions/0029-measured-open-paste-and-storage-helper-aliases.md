# ADR 0029: Measured open, paste, and storage helper aliases

- Status: accepted
- Date: 2026-08-29

## Context

The post-ADR-0028 corpus probe identified six remaining named legacy/helper
blockers: `copyTextToClipboard` (3 extensions), `OpenAction` (3), `pasteText`
(3), `removeLocalStorageItem` (3), `clearLocalStorage` (2), and `PasteAction`
(2). The pinned Raycast declarations define these as aliases or thin action
wrappers over existing Clipboard, LocalStorage, and `open` behavior.

## Decision

- Export `OpenAction` as the measured `Action.Open` component. Require a
  non-empty target, normalize an optional application to the existing
  primitive `open.open` request, and invoke `onOpen` after the host operation
  succeeds.
- Export `PasteAction` as the measured `Action.Paste` component. Normalize
  string, numeric, and structured content with the existing clipboard
  serializer, send it through a new explicit `clipboard.paste` capability
  operation, and invoke `onPaste` after success.
- Export `copyTextToClipboard` and `pasteText` as aliases of
  `Clipboard.copy` and `Clipboard.paste`; export `removeLocalStorageItem` and
  `clearLocalStorage` as aliases of `LocalStorage.removeItem` and
  `LocalStorage.clear`.
- Keep all operations deny-by-default and identity-scoped. Add the aliases to
  the corpus probe and cover their render and activation behavior with one
  deterministic child-process fixture.

## Consequences

- The next six static blockers are removed, and legacy action/helper imports
  use the same validation and host boundaries as their modern equivalents.
- Clipboard paste is now an explicit host capability; production clients must
  provide the active-application paste behavior and consent policy.
- The corpus probe records a nine-extension increase in end-to-end renders,
  while dependency failures and dynamic/namespace imports remain outside this
  slice.
