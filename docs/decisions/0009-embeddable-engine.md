# 0009 — Blast is an embeddable engine

Status: accepted 2026-10-19; absorbs surviving points from 0007 and 0011

## Decision

1. Blast loads, builds and runs Raycast extensions and exposes commands as
   scenes, semantic views, events and capability requests. Launcher UI belongs
   to the embedder; TUI and `blast run` are reference/debug clients.
2. JS/TS hosts use `@blastlauncher/engine`; other languages use `blast serve`.
   Both expose the same engine operations: extension lifecycle and manifests,
   dependency checks/installs, preferences, launch, scenes/views/events,
   capability forwarding, shutdown and crash reports.
3. Client semantics live in framework-free `client-core`: filtering and
   ranking, selection, actions and shortcuts, navigation, pagination, grids,
   dropdowns, forms and feedback. Embedders draw the resulting views and send
   semantic input.
4. The embedder protocol is versioned NDJSON. `blast serve` sends `hello`,
   accepts `welcome`, then request/response envelopes and asynchronous events.
   It supports extension and session methods, capability grants/progress/cancel,
   optional controller views, and additive protocol-v1 fields. Lines are UTF-8,
   capped at 8 MiB; ids are unique while outstanding; EOF shuts down cleanly.
5. Distribution publishes emitted ESM and declarations; source remains directly
   runnable in the repository. The protocol schema ships with releases.

## Why

Most launcher work is repeated presentation and Raycast semantics. A stable
engine contract lets any language provide a small renderer while Blast owns the
hard lifecycle and compatibility behavior.

## Consequences

The TUI remains a conformance client, desktop launchers are unscheduled, and
protocol-breaking changes require a new embedder version.
