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
4. The embedder protocol is versioned NDJSON over `blast serve` stdio; stdout
   carries protocol lines only, stderr diagnostics. The embedder sends
   `hello {protocol, capabilities}` and receives `welcome {protocol, engine,
   catalog}`; another version gets `version_mismatch` and exit 2. Then
   `request {id, method, params}` / `response {id, ok, result | error}` and
   asynchronous events, possibly before their response and out of order.
   Ids are unique while outstanding. Lines are UTF-8, capped at 8 MiB; a
   malformed line gets `error` and parsing resumes at the next newline.
   Granted capabilities are forwarded as `capability.request` and answered with
   `capability.result`/`progress`; aborts send `capability.cancel`.
   `engine.shutdown` or EOF finishes pending work and exits 0. Additive
   changes stay v1; breaking ones become `embedder-v2`.
5. Distribution publishes emitted ESM and declarations; source remains directly
   runnable in the repository. The protocol schema ships with releases.

## Why

Most launcher work is repeated presentation and Raycast semantics. A stable
engine contract lets any language provide a small renderer while Blast owns the
hard lifecycle and compatibility behavior.

## Consequences

The TUI remains a conformance client, desktop launchers are unscheduled, and
protocol-breaking changes require a new embedder version.
