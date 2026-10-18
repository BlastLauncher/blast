# ADR 0104: Preserve V2 action chrome fidelity

- Status: Accepted
- Date: 2026-08-31

## Context

The scene contract already carries normalized action shortcuts, `regular` and
`destructive` styles, and the measured `autoFocus` flag. The V2 window renders
action titles and callbacks, but currently ignores structured shortcuts,
visual style, and focus intent.

## Decision

Update the V2 action button renderer to:

- display structured shortcuts with the same deterministic labels used by the
  other V2 scene controls;
- map `regular` and `destructive` to explicit button styling and a stable data
  attribute; and
- pass the validated `autoFocus` flag through to the action button.

Action activation continues to use the existing semantic scene-event bridge and
form action values. No new action helper, action-panel search, or host provider
is introduced by this slice.

## Boundary

This closes presentation fidelity for the already-measured action metadata in
the opt-in V2 window. It does not claim support for broader action helpers,
native action-panel behavior, or OS-level focus management.

## Consequences

Destructive actions are visibly distinct, keyboard shortcuts remain discoverable,
and an extension can mark its primary action for initial focus. The behavior is
covered by the existing server-rendered V2 scene smoke without requiring
Electron or a browser session.

## Verification

- server-render structured shortcut, destructive style, and auto-focus output;
- keep scene interaction and compatibility fixtures green;
- type-check and Forge-bundle the Electron client; and
- retain the full V2 and format/lint gates.
