# ADR 0129: Present Quick Look metadata without previewing files

- Status: Accepted
- Date: 2026-09-04

## Context

`List.Item` and `Grid.Item` already carry validated `quickLookPath` and
`quickLookName` scene props, and `Action.ToggleQuickLook` already crosses the
`quick-look.toggle` capability (granted in probes, noop provider). The opt-in
Electron renderer ignored that metadata, so items with Quick Look showed no
affordance and the toggle action had no visible effect.

macOS Quick Look previews do not exist on the Linux reference client, and
loading arbitrary host file contents into the renderer would be a new trust
boundary.

## Decision

Present Quick Look as metadata only in List/Grid items: when `quickLookPath`
is present, show `Quick Look: <quickLookName or path basename>` with the full
path as hover title. Items without metadata render unchanged. The existing
`ToggleQuickLook` action button keeps firing the current capability through
the scene event channel; no scene, protocol, or capability changes, and no
file contents are loaded.

## Boundary

No file-content previews, Open With chooser, command-metadata chrome, or host
file-picker changes. Those remain sequenced after compatibility behavior
sign-off and host/provider decisions.

## Consequences

Quick Look availability becomes truthful in the V2 client without claiming a
macOS preview or widening filesystem access. Strict scene validators and the
deny-by-default capability posture are untouched.

## Verification

- server-rendered List/Grid Quick Look label cases (named, basename, absent);
- `pnpm --filter blast run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
