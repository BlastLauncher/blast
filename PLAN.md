# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `main`. Keep this file under 120 lines; detail belongs in task files.

## Current focus

M15 done (2026-11-17): the demo's sandbox traffic goes through
`blast-proxy.yukai.dev` (decision 0017). Next milestone not chosen yet.

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
- [x] 0153 Product story: README, `docs/quickstart.md`, `docs/embedding.md`
- [x] 0154 Landing page: simple API, any language, demo front and centre
- [x] 0155 Zero-config serve: runnable bin, views by default, drawable icons
- [x] 0156 Engine root view: search and launch commands across extensions
- [x] 0157 Launch prompts and dependency installs as views
- [x] 0158 Minimal Python embedder (stdlib, ≤ 200 lines); Go example on new flow
- [x] 0159 `@blastlauncher/web`: embed the browser runtime in any page (+ decision)
- [x] 0160 TUI on the engine root view and launch prompts
- [x] 0161 Deterministic TUI picker capability-handler test
- [x] 0162 Real engine version in the serve welcome
- [x] 0163 Browser demo on `@blastlauncher/web`
- [x] 0164 `@blastlauncher/web` ships its sandbox and runtime assets
- [x] 0165 macOS and web-launcher examples on the engine flows
- [x] 0166 Docs, README and landing page show the final API
- [x] 0167 Site e2e without GitHub API quota
- [x] 0168 Engine prompt and root view gaps found by the TUI migration
- [x] 0169 M9 follow-ups: TUI scope, Python errors, web launcher, release web e2e

### M10 — Published and measured

- [x] 0170 Docs and landing install from npm `@next` (alpha.2)
- [x] 0171 Browser sweep: fresh baseline, placeholder preferences, browser limits apart
- [x] 0172 Browser runtime fixes: extension assets, forbidden fetch headers, triaged errors
- [x] 0173 Coverage measured against `@raycast/api` 2.11.1 (#89)

### M11 — tmux palette

- [x] 0174 TUI popup mode: several extension dirs, exit on close, start-up time
- [x] 0175 `tmux` extension I: one-shot pane, window, session and system commands
- [x] 0176 `tmux` extension II: find/move pane, choose session, rename and new forms
- [x] 0177 Publish `@blastlauncher/tui` (bin `blast-tui`, bundled `tmux` extension)
- [x] 0178 tmux plugin (`examples/tmux-plugin`) with a real-tmux e2e in CI
- [x] 0179 Docs, README and landing for the tmux palette

### M12 — Site as a library

- [x] 0180 User-facing docs rendered on the site under `/docs/`
- [x] 0181 Landing redesign: reference-book look, engine hero animation
- [x] 0182 Landing craft pass: book typography, fewer boxes, hero tells the flow

### M13 — Product landing (0183–0184): hero with the live demo, real blast-tui recording

### M14 — Work through PRs

- [x] 0185 Task scripts work through one pull request per task
- [x] 0186 Build-time syntax highlighting; docs pages in the landing design

### M15 — CORS proxy

- [x] 0187 CORS proxy Worker (`packages/cors-proxy`) and decision 0017
- [x] 0188 `fetchProxy` in `@blastlauncher/web`: sandbox fetch and XHR through the proxy
- [x] 0189 Demo on the deployed proxy, policy notice, sweep and catalog refresh

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
