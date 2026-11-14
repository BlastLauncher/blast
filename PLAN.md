# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `main`. Keep this file under 120 lines; detail belongs in task files.

## Current focus

M9 — Embed anywhere. Make Blast the easiest engine to embed: the engine owns
the launcher flow (`docs/decisions/0014`), embedders only draw views and
forward input, in any language or in a browser page. Product story, README,
docs and landing page lead with that.

Status 2026-11-14: M0–M8 done, CI green, `3.0.0-alpha.1` on npm `next`, site at
blast.yukai.dev. Coverage 1537/1538 current symbols; sweep 5266/5759 render;
browser demo 138/237. Embedding cost today: Go example 692 lines, AppKit 3288;
the command picker exists three times (TUI, browser, AppKit).

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

### M9 — Embed anywhere

Docs first for today's API, then the engine takes over the flow, then every
client and doc shows the smaller API.

- [x] 0152 Condense decision records into a few current-state records
- [ ] 0153 Product story: README, `docs/quickstart.md`, `docs/embedding.md`
- [ ] 0154 Landing page: simple API, any language, demo front and centre
- [ ] 0155 Zero-config serve: runnable bin, views by default, drawable icons
- [ ] 0156 Engine root view: search and launch commands across extensions
- [ ] 0157 Launch prompts and dependency installs as views
- [ ] 0158 Minimal Python embedder (stdlib, ≤ 200 lines); Go example on new flow
- [ ] 0159 `@blastlauncher/web`: embed the browser runtime in any page (+ decision)
- [ ] 0160 Reference clients on engine-owned flows; docs refresh

## Later (not scheduled)

Out of scope (0009): MyGo, TUI launcher features.

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
- 2026-11-05: Browser runtime runs extensions only in almostnode's cross-origin sandbox (`0013`).
- 2026-11-14: Engine owns the launcher flow; embedders only draw views (`0014`).
