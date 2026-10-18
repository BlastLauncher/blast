# ADR 0130: Present Open With actions with their target

- Status: Accepted
- Date: 2026-09-04

## Context

`Action.OpenWith` collapsed into a generic scene `action` node: the target
path stayed in the runtime closure and only reached the host through the
`open.open { target, openWith: true }` capability on activation. The client
could not distinguish Open With from any other action, so it rendered a plain
button with no indication of which file the chooser is for. Production wires
no `open` capability provider, so activation denies without one; the probe
grants it with a noop provider.

## Decision

Carry `openTarget` (validated string) and `openWith` (validated boolean) as
optional scene `action` props. The adapter sets both on `Action.OpenWith`;
`Action.Open` and all other actions are unchanged. The Electron renderer shows
the target basename alongside the action title with the full path as hover
title when both markers are present. Activation still fires the existing
scene event through the unchanged `open.open` capability path.

## Boundary

No host application chooser, no production `open` provider, no file-content
access, and no change to `Action.Open` or other actions. The provider and
consent UI remain the deferred "real operating-system providers" work, and
activation without a provider still reports the existing structured denial.

## Consequences

Open With actions are visually honest about their target without claiming a
working chooser. Strict scene validation rejects mistyped markers, and the
capability posture is untouched.

## Verification

- scene validation accepts typed markers and rejects mistyped ones;
- adapter asserts `openTarget`/`openWith` on the Open With action;
- server-rendered Open With/plain action presentation test;
- `pnpm --filter blast run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
