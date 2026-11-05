# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `main`. Keep this file under 120 lines; detail belongs in task files.

## Current focus

M6 — evidence at scale. Blast is the engine; launchers embed it. The TUI and
`blast run` stay reference clients and get no new launcher features.

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

- [x] 0011–0014 corpus fetch, API usage scan, shared `@raycast/utils`, smoke runner

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
0 bundle failures, 0 unsupported-api. Shared deps satisfy 2009/3443 corpus
extensions. Each step is a task with `@covers` evidence.

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
- [x] 0063–0069, 0071–0079, 0081 done (see git log): client-core (ranking,
      shortcuts, controller), extension handle, engine registry, capability
      catalog, `blast serve` + schema + docs, Go example, native I/II, release
      build, slim engine (13 MiB), CLI package, TUI on the controller.
      Coverage 2026-10-20: non-deprecated 1533/1534 (embedder-owned
      `BrowserExtension.getContent`), deprecated 939/939.
- [x] 0080 Views over `blast serve` (client-core controller per session)
- [x] 0070 Deps-heavy corpus (`compat/SMOKE-DEPS.md`, after 0082–0087): 25/25
      installs, 54/56 render (20 with placeholder inputs), 2 `open.url` denials
- [x] 0082 tsconfig paths; 0083 lean installs; 0084 form editing; 0085 keep required peers
- [x] 0086 smoke placeholder args/prefs; 0087 bundle time limit

### M6 — Evidence at scale

- [x] 0088–0105 done (see git log): honest gate, API 2.10.1 + weekly job, corpus
      repin, sandboxed sweep (5266/5759 render, `compat/SWEEP.md`), triage fixes,
      dependencies in launch (`0012`), Go example on views, v3 pre-release via
      npm trusted publishing (`3.0.0-alpha.0` on `next`), TUI polish.

### M7 — Real examples

AppKit launcher over `blast serve`; automated tests and contract fixtures first.

- [x] 0106 BlastKit + contract fixtures + macOS CI; 0107 AppKit window; 0108 hotkey, OS
      actions, picker; 0109 walkthroughs (`docs/walkthroughs/`)
- [x] 0110 deterministic watch tests; 0111 paste `closeMainWindow`; 0112 macOS windows without
      yabai; `archive/` deleted (tag keeps it); `3.0.0-alpha.1` on `next` with provenance

## Later (not scheduled)

- Orchestrator loop over `tasks/`. Out of scope (0009): MyGo, TUI launcher features.

## Decision log

One line per decision; link a record only when it exists.

- 2026-10-18: Bun dev toolchain, Node 24-runnable product; headless client first.
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
- 2026-11-02: Corpus sweeps run third-party code only in a no-network sandbox.
- 2026-11-04: Launch reports missing dependencies as a typed error (`0012`); M7 example uses AppKit.
