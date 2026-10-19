# 0009 — Blast is an embeddable engine; launchers are its clients

Status: accepted 2026-10-19; supersedes the M5 desktop-client plan in 0007 (7)

## Decision

1. **The product is the engine.** Blast loads, builds and runs unmodified
   Raycast extensions and exposes them as scenes, events and capability
   requests. Launcher UI (pickers, themes, windows, hotkeys) belongs to
   whoever embeds the engine; `packages/tui` and `blast run` stay as
   reference/debug clients and get no new launcher features.
2. **Two embedding surfaces, one contract.**
   - In-process: `@blastlauncher/engine` for JS/TS hosts (Node 24, Bun,
     Electron main). It wraps today's host API.
   - Out-of-process: `blast serve`, a long-running engine speaking versioned
     NDJSON over stdio. It serves embedders in any language (Go, Swift, Rust,
     Tauri, web backends), with the same operations and the same message
     shapes as the in-process API.
3. **Engine operations** cover what every launcher would otherwise rewrite:
   - extension load and manifest validation, with live reload;
   - command list;
   - dependency install (0008);
   - the preference schema, missing-required check and store;
   - launch with arguments, scenes and events;
   - capability requests forwarded to the embedder, with default handlers
     for storage, cache, preferences and OAuth tokens;
   - shutdown and crash reports.
4. **Client behaviour moves into the engine.** Raycast semantics that the
   TUI implements today move into a framework-free `client-core` module that
   both surfaces expose, so every embedder behaves like Raycast and only
   draws:
   filtering, section order and throttle; selection; primary action, action
   panel and shortcut matching; pagination trigger; dropdown and grid layout;
   the form field model; toast, HUD and alert lifecycle.
5. **Embedder-facing protocol is versioned and documented.** A machine-readable
   schema (JSON Schema generated from `packages/protocol`) is published with
   each release. Changes follow semver on the protocol version, independent of
   package versions.
6. **Distribution.** Node refuses to strip types under `node_modules`, so
   published packages ship emitted ESM JS + `.d.ts` built at release time
   (`tsc`), while the repo keeps running sources directly. `blast serve` also
   ships as a single executable later; it needs a Node 24 runtime for
   extension children.

## Why

Most people building launchers or Raycast-like forks want Raycast extensions
to "just render" inside their own UI. The value is an engine with complete,
correct Raycast semantics behind a small stable contract, not another
launcher.

## Consequences

- Coverage partials that were "client-owned" become engine work again and
  must reach covered status through `client-core` tests.
- The TUI is rebuilt on `client-core` and serves as the conformance demo.
- MyGo/desktop launcher work is unscheduled; a Go embedder example over
  `blast serve` replaces it.
