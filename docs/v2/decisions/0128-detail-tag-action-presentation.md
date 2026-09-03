# ADR 0128: Present Detail metadata tag actions

- Status: Accepted
- Date: 2026-09-04

## Context

The compatibility adapter already accepts `Detail.Metadata.TagList.Item`
`onAction` callbacks and the scene contract already carries them as validated
`onAction` event IDs through the React renderer. The opt-in Electron scene
renderer rendered every tag as static text, so the event could never fire end
to end.

## Decision

Render tags without an `onAction` event as static text (unchanged) and tags
with an event as buttons that fire the existing scene event through the
current `onEvent` channel. Buttons respect the scene `disabled` state. No
scene, protocol, or capability changes; strict validators for Grid columns,
malformed collection children, and other measured boundaries are untouched.

## Boundary

No Quick Look presentation, Open With chooser, command-metadata chrome, or
host file-picker changes. Those remain sequenced after compatibility
behavior sign-off and host/provider decisions.

## Consequences

Measured tag actions become interactive in the V2 client while static tags
render exactly as before. Adapter event dispatch and client presentation are
covered by their existing deterministic tests plus one server-rendered
actionable/static tag case.

## Verification

- server-rendered actionable/static tag test;
- `pnpm --filter blast run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
