# ADR 0102: Present the V2 toast lifecycle in the client

- Status: Accepted
- Date: 2026-08-31

## Context

The V2 scene and protocol contracts already validate toast show, update, and
hide operations, messages, styles, IDs, and primary/secondary action
metadata. The Electron V2 window currently appends title-only payloads to a
three-entry list, so updates duplicate entries, hides do nothing, and action
callbacks are not reachable from the client.

## Decision

Add a small pure toast state reducer and a V2 toast stack component:

- treat an omitted operation as 'show';
- identify updates and hides by 'toastId', replacing an existing entry or
  removing it without duplicating the stack;
- assign a local ID to legacy ID-less show payloads and cap visible entries at
  three, retaining the newest entries;
- render title, message, style, and primary/secondary action buttons with
  structured shortcut labels; and
- send toast action event IDs through the existing semantic scene-event bridge
  in the main process.

The client does not invent a timeout or dismiss operation in this slice.
Automatic timeout policy remains a separate compatibility decision; an
extension-controlled hide remains authoritative.

## Boundary

This makes the already-validated toast lifecycle usable in the opt-in V2
Electron window. It does not add OS notifications, renderer-to-core sockets,
or a new protocol message.

## Consequences

Toast updates and hides now have stable client behavior, and action callbacks
can reach the active extension with the same validation and failure handling as
other scene events. The reducer is deterministic and can be tested without
Electron or a browser session.

## Verification

- test show/update/hide reconciliation, ID-less shows, and three-entry
  stacking;
- server-render toast content, styles, actions, and shortcut labels;
- type-check and Forge-bundle the Electron client; and
- keep the full V2, Electron, lint, and format gates green.
