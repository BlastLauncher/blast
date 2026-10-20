# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `v3/restart`. Keep this file under 120 lines; detail belongs in task
files.

## Current focus

M5 — embeddable engine (`docs/decisions/0009`). Blast is the
engine; launchers embed it. The TUI and `blast run` stay reference clients
and get no new launcher features.

## Milestones

### M0 — Workflow foundation

- [x] Workflow, verify gate, CI, `compat/` vendoring, inventory, evidence (0001–0003)

### M1 — Headless vertical slice

One fixture extension command (List + Action + Clipboard.copy) runs in its own
Node child process, renders through a React reconciler into a serializable
scene, and is driven by a headless client: snapshot the scene, dispatch an
action, observe the clipboard capability request, survive a crash.

- [x] Process/protocol/scene model (`0001`), protocol, reconciler, shim,
      runtime entry, host, `blast` CLI (0004–0010)

### M2 — Real extensions

Run unmodified commands from `raycast/extensions` headlessly. Corpus pinned
at commit `3b812d1e` (3,443 extensions). No `npm install`: Blast provides one
shared copy of `@raycast/utils` for every extension.

- [x] 0011 Corpus fetch tool: pinned shallow sparse checkout + disk guard
- [x] 0012 Static API usage scan of the whole corpus → weights in `compat/`
- [x] 0013 Shared `@raycast/utils` and dependency policy for bundling
- [x] 0014 Curated smoke runner + report for the first 10 commands

First curated set: 10 List-centric, offline extensions (see git log 0014).

### M3 — Coverage to 100%

Goal: 100% of the non-deprecated `@raycast/api` surface, then deprecated
aliases. First step: export a stub for every inventory symbol that throws a
structured "unsupported in Blast" error when used, so missing APIs fail with
diagnostics instead of ESM link errors.

- [x] 0015–0051 done: stubs, every API area, shared deps, deprecated aliases,
      curated sets v1–v4, smoke tooling (see git log).

Smoke 2026-10-19 (`compat/SMOKE.md`, 80 extensions): 184/200 commands render,
1 completed, 7 expected denials, 5 need arguments, 3 need API keys,
0 bundle failures, 0 unsupported-api. Coverage
2026-10-19: non-deprecated 1496/1534 covered, 38 partial (client-owned
filtering, menu-bar/HUD effects), 0 missing. Shared deps satisfy 2009/3443
corpus extensions. Each step is a task with `@covers` evidence.

### M4 — Terminal client (OpenTUI)

Interactive TUI over the host API, on Bun (`docs/decisions/0007`): List,
Grid, Detail, Form, action panel, navigation, feedback, menu bar, command
picker, dependency install (`0008`), preferences, palette look.

- [x] 0052–0062 done (see git log).

### M5 — Embeddable engine

Anyone can embed Blast and render Raycast extensions in their own UI: an
in-process JS API and `blast serve` over stdio for other languages, with
Raycast client semantics built in so embedders only draw.

- [x] Decisions 0009 (engine boundary, two surfaces, distribution) and 0010
      (platform-free core, capability registry + catalog, optional native)
- [x] 0063 `packages/client-core`: move framework-free client behaviour
      (filtering, selection, actions, shortcuts, grid, dropdown, form model)
      out of `packages/tui`; the TUI consumes it
- [x] 0064 Engine API: extension handle (manifest + live reload, commands,
      deps, preference schema/store, launch) moved out of the TUI picker
- [ ] 0065 Close the 38 client-owned partials with `client-core` evidence
- [ ] 0066 `blast serve`: versioned embedder protocol over stdio,
      capabilities forwarded to the embedder
- [ ] 0067 Protocol JSON Schema export + `docs/embedding.md`
- [ ] 0068 Minimal non-JS embedder example over `blast serve` (Go)
- [ ] 0069 Release build: emitted JS + `.d.ts`, `npm pack` smoke on Node 24
- [ ] 0070 Real-world compat: dependency-heavy corpus set with installs
- [ ] 0071 Deprecated aliases: the 50 missing deprecated symbols
- [ ] 0072 Capability catalog in `protocol` (names, shapes, scope, API users)
- [ ] 0073 Engine handler registry; `blast` CLI + headless answers → `packages/cli`
- [ ] 0074 `@blastlauncher/native` I: clipboard, open, file manager, trash
- [ ] 0075 `@blastlauncher/native` II: applications, selection, windows

## Later (not scheduled)

- Scheduled job regenerating `compat/` for the newest `@raycast/api` (PR).
- Autonomous orchestrator loop over `tasks/`; delete `archive/`.
- Desktop launcher (MyGo) and further TUI launcher polish (out of scope per 0009).

## Decision log

One line per decision; link a record only when it exists.

- 2026-10-18: Bun for dev toolchain; product code stays Node 24-runnable.
- 2026-10-18: Headless client first; desktop UI deferred to M4.
- 2026-10-18: Process/protocol/scene model accepted (`docs/decisions/0001`).
- 2026-10-18: Coverage denominator is the latest `@raycast/api` declarations.
- 2026-10-19: M4 is an OpenTUI terminal client on Bun; MyGo desktop later (`0007`).
- 2026-10-18: AI model providers run in their own runtime child (`docs/decisions/0006`).
- 2026-10-18: Extra npm deps: interim shared pinned allowlist until v1;
  production should reference each extension's own pinned deps via a thin,
  minimal-disk layer instead (0037 records it in `docs/decisions/0002`).
- 2026-10-19: Extensions' own lockfile deps install outside the extension via
  an explicit build step; allowlist stays the fallback (`docs/decisions/0008`).
- 2026-10-19: Engine first: Blast is embeddable (in-process + `blast serve`);
  launcher UI is the embedder's; MyGo deferred (`docs/decisions/0009`).
- 2026-10-19: Engine core is platform-free; native capabilities are registered
  by embedders, with optional `@blastlauncher/native` (`docs/decisions/0010`).
