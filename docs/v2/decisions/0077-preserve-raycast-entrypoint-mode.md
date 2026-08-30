# ADR 0077: Preserve Raycast entrypoint mode in the environment

- Status: Proposed for implementation
- Date: 2026-08-30

## Context

The Raycast `Environment` contract exposes both `entryPointMode` and its
deprecated `commandMode` alias. The filesystem catalog already reads each
manifest command, including its `view`, `no-view`, or `menu-bar` mode, but the
V2 extension descriptor currently drops that field. The compatibility adapter
therefore reports `"view"` for every command, including menu-bar and no-view
entrypoints.

This is an API metadata fidelity issue, not a host capability or platform
dependency issue. The selected command mode is trusted manifest data and can
cross the existing descriptor boundary without changing scene semantics.

## Proposed slice

- Carry an optional validated `entryPointMode` through the extension contract
  and filesystem catalog, defaulting an omitted manifest mode to Raycast's
  `"view"` behavior.
- Have the compatibility adapter derive `environment.entryPointMode` and the
  deprecated `environment.commandMode` from that descriptor field, while
  retaining the current `"view"` fallback for manually constructed legacy
  contexts.
- Add deterministic contract, catalog, and adapter tests for all three modes;
  preserve existing descriptor fixtures that omit the optional field.

## Boundary

The slice does not infer tool entrypoints, change command selection, or add
menu-bar client presentation. `entryPointType`, owner metadata, appearance,
and host-owned environment providers remain separate follow-ups.
