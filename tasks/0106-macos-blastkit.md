---
id: "0106"
title: macOS example, part 1 — BlastKit (Swift client) with contract tests
status: doing
milestone: M7
depends: []
---

## Goal

A Swift package under `examples/macos-launcher` whose `BlastKit` library is a
complete, tested client of `blast serve` views, verified against the engine's
real output in CI.

## Context

M7 builds a flagship AppKit launcher example (owner decision 2026-11-04: AppKit,
not SwiftUI; code-driven automated testing and verification come first). This
task is the UI-free core; 0107 adds AppKit on top.

- Protocol: `docs/embedding.md` ("Views"), decision 0011, the JSON Schema at
  `packages/protocol/schema/embedder-v1.schema.json`. The Go example
  (`examples/go-embedder`) is a working reference client of the same flow.
- View model: `ControllerView` in `packages/client-core/src/controller.ts`
  (kinds list, grid, detail, form, menu-bar; search, rows, actions, feedback,
  navigation). Inputs: `controllerInput` in the schema.
- Toolchain: local Swift 6.4 / Xcode 27; GitHub `macos-latest` is macOS 26 with
  Xcode 26.6 by default. Use `swift-tools-version: 6.0`, deploy to macOS 14,
  Swift Package Manager only (no `.xcodeproj`), standard library and
  Foundation only (no third-party packages).

Layout: `Package.swift`; `Sources/BlastKit` (library);
`Tests/BlastKitTests`; `Tests/Fixtures`.

## Acceptance

- [ ] `BlastKit` provides: a transport protocol with a `Process` stdio
      implementation that spawns `node packages/serve/src/main.ts` (path
      configurable); NDJSON framing with the 8 MiB line cap; the
      `hello`/`welcome` handshake; request/response correlation with typed
      errors (including `missing_values` and `missing_dependencies` data);
      events (`session.view`, `session.exited`, `dependencies.log`, …);
      `Codable` `ControllerView` (all kinds) and `ControllerInput`; and
      capability requests routed to an injectable handler protocol (unhandled
      ones answered with an error).
- [ ] Unit tests use a fake transport: framing (split and joined lines,
      oversize line), out-of-order responses, events before responses,
      malformed lines, capability round trips, `version_mismatch`.
- [ ] Contract fixtures: a script (`bun run example:mac:fixtures`) launches
      fixture extensions through the real engine and records `session.view`
      JSON for at least list, grid, detail, form and menu-bar, plus a toast and
      an open action panel, into `Tests/Fixtures/`. Swift tests decode every
      fixture and assert key fields. `bun run verify` fails if the fixtures
      are stale (regenerate and compare), like `compat/`.
- [ ] An integration test drives the real `blast serve` with `hello-list`:
      handshake, list view with a selected row, `move down`, `primary`, and a
      `clipboard.copy` capability answered by a fake handler. It never touches
      the real clipboard or opens apps.
- [ ] CI: a `macos-example` job on `macos-latest` (actions pinned by SHA, Xcode
      selected explicitly) runs `bun install --frozen-lockfile` and
      `swift test` in the package.
- [ ] `examples/macos-launcher/README.md`: how to build and test; `bun run
      example:mac` runs the Swift tests locally. `bun run verify` passes.

## Out of scope

- AppKit UI (0107), hotkeys and real OS handlers (0108).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
