# ADR 0001: Rewrite V2 in the existing repository

- Status: accepted
- Date: 2026-08-27

## Context

The 2023 prototype proved that Raycast-style React extensions could be executed
by an open host and rendered by a separate Electron client. Its API, renderer,
runtime, transport, and privileged operations are tightly coupled, so preserving
the implementation would constrain the new architecture.

The product mission remains the same: provide an open home for useful launcher
extensions. Repository history, attribution, issues, and the modernized
toolchain therefore remain relevant.

## Decision

Build V2 as new packages and vertical slices in the existing Git history. Do
not create an orphan branch. Keep the prototype runnable until V2 replaces its
useful path, then remove legacy code in an explicit commit.

## Consequences

- V2 may replace nearly all application code without hiding how it evolved.
- Modern toolchain and CI work is reused.
- V1 and V2 coexist temporarily, increasing workspace size.
- New packages must not depend on V1 internals merely to accelerate migration.
