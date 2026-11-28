# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `main`. Keep this file under 120 lines; detail belongs in task files.

## Current focus

M23: Docs and landing page refresh for Alfred workflow status (#47 closed, #139 follow-ups).

## Milestones

- [x] M0 Workflow, verify gate, CI, `compat/` tooling (0001–0003)
- [x] M1 Headless slice: protocol, reconciler, shim, runtime, host, CLI (0004–0010)
- [x] M2 Real extensions: corpus, usage scan, shared `@raycast/utils`, smoke (0011–0014)
- [x] M3 Coverage to 100% incl. deprecated; curated sets v1–v4 (0015–0051)
- [x] M4 OpenTUI terminal client, dependency installs, preferences (0052–0062)
- [x] M5 Embeddable engine: client-core controller, registry, capability catalog,
      `blast serve` + schema + views, native, release build, lean installs (0063–0087)
- [x] M6 Evidence at scale: API tracking, sandboxed sweep, deps in launch (0088–0105)
- [x] M7 Real examples: BlastKit/AppKit launcher, web launcher, task scripts (0106–0114)
- [x] M8 Browser runtime: extensions by URL in almostnode's sandbox, site,
      showcase, Raycast-style demo UI (0115–0151)
- [x] M9 Embed anywhere: engine root view, prompts, `@blastlauncher/web`, examples (0152–0169)
- [x] M10 Published and measured: `@next` alpha.2, browser sweep, `@raycast/api` 2.11.1 (0170–0173)
- [x] M11 tmux palette: popup TUI, `tmux` extension, `@blastlauncher/tui`, plugin (0174–0179)
- [x] M12 Site as a library: `/docs/` pages, landing redesign and craft pass (0180–0182)
- [x] M13 Product landing: hero with the live demo, real blast-tui recording (0183–0184)
- [x] M14 Work through PRs: one-PR task scripts, build-time highlighting (0185–0186)
- [x] M15 CORS proxy: Worker, `fetchProxy` in `@blastlauncher/web`, demo refresh (0187–0189)
- [x] M16 Browser bridge: loopback WebSocket for real `BrowserExtension` tabs (0190)
- [x] M17 Current and measured: `@raycast/api` 2.14.0, scene patches, runtime pool,
      embedder protocol 2, examples, `alpha.10` on `latest` (0191–0197)
- [x] M18 Faster loop, readable docs: CI/verify speedups, docs trim, perf numbers (0198–0200)
- [x] M19 Loop feedback: worktree-only task scripts, verify lock, briefs & clean (0201–0203)
- [x] M20 Landing polish: landing page current for alpha.10 and mobile polish (0204)
- [x] M21 Alfred workflow compatibility: decision 0021, `@blastlauncher/alfred`,
      protocol v1 runtime, host/CLI/serve/TUI integration, `alfred:analyze` (0205–0210)
- [x] M22 Deeper Alfred workflow coverage: 11 object types, File Filter,
      35 core Automation Tasks, per-task coverage reporting (0211–0213)

### M23 — Docs and landing page refresh

- [x] 0214 Update docs, README, and landing page for Alfred workflow status
- [x] 0215 Parody landing page at /slop/ with a navbar link

## Later (not scheduled)

- Browser sweep: numeric placeholders for number-typed arguments (convert-px-to-vw-vh).
- Browser: `sf-symbols-search` times out parsing its 1.1 MB asset.
- Sweep: upstream 401/403/502 with placeholder preferences is a Blast failure, not needs-credentials.
- Browser: `uk-bank-holidays` decodes brotli with `zlib`, missing in almostnode.

Out of scope (0009): MyGo, TUI launcher features.

## Decision log

One line per decision; link a record only when it exists.

- 2026-10-18: Bun dev toolchain, Node 24-runnable product; headless client first.
- 2026-10-18: Process/protocol/scene model accepted (`docs/decisions/0001`).
- 2026-10-18: Coverage denominator is the latest `@raycast/api` declarations.
- 2026-10-19: M4 is an OpenTUI terminal client on Bun; MyGo desktop later (now in `0009`).
- 2026-10-18: AI model providers run in their own runtime child (`docs/decisions/0006`).
- 2026-10-18: Extra npm deps: interim shared pinned allowlist until v1;
  production should reference each extension's own pinned deps via a thin,
  minimal-disk layer instead (0037 records it in `docs/decisions/0002`).
- 2026-10-19: Extensions' own lockfile deps install outside the extension via
  an explicit build step; allowlist stays the fallback (now in `docs/decisions/0002`).
- 2026-10-19: Engine first: Blast is embeddable (in-process + `blast serve`);
  launcher UI is the embedder's; MyGo deferred (`docs/decisions/0009`).
- 2026-10-19: Engine core is platform-free; native capabilities are registered
  by embedders, with optional `@blastlauncher/native` (`docs/decisions/0010`).
- 2026-11-02: Corpus sweeps run third-party code only in a no-network sandbox.
- 2026-11-04: Launch reports missing dependencies as a typed error (now in `0002`); M7 example uses AppKit.
- 2026-11-05: Browser runtime runs extensions only in almostnode's cross-origin sandbox (`0013`).
- 2026-11-14: Engine owns the launcher flow; embedders only draw views (`0014`).
- 2026-11-14: `3.0.0-alpha.2` published to npm `next`, including `@blastlauncher/web`.
- 2026-11-15: tmux palette: published TUI, `tmux` extension, plugin in its own repo (`0016`).
- 2026-11-15: `3.0.0-alpha.3` published to npm `next`, adding `@blastlauncher/tui`.
- 2026-11-17: Sandbox network may go through an embedder-hosted CORS proxy; ours is a Worker that stores nothing (`0017`).
- 2026-11-19: `@blastlauncher/native` hosts a loopback companion-extension WebSocket server for real `BrowserExtension` tabs and content (`0018`).
- 2026-11-26: Runtime sends opt-in `scene.patch` updates; the engine keeps one pre-warmed standby runtime (`0019`).
- 2026-11-26: Embedder protocol 2 replaces 1: full view, then generic set/delete/splice patches with strict revisions; scenes on request (`0020`).
- 2026-11-27: `3.0.0-alpha.10` published; npm `latest` now tracks v3 on every package, including `cli` and `runtime`.
- 2026-11-27: Alfred workflows run first-class in Blast via `@blastlauncher/alfred` as a dedicated protocol-v1 runtime child (`0021`).
