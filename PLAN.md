# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `v3/restart`. Keep this file under 120 lines; detail belongs in task
files.

## Current focus

M3 — coverage to 100%. Curated set v3 is clear of API gaps, so the next
batches come from "Top missing by usage" in `compat/COVERAGE.md`, plus an
interim shared-dependency allowlist (0036 → 0037).

## Milestones

### M0 — Workflow foundation

- [x] Archive prototype; new AGENTS.md, PLAN.md, task format
- [x] `bun run verify` gate and `check:workflow` guard
- [x] CI runs verify on push and pull request
- [x] 0001 Vendor latest `@raycast/api` declarations into `compat/`
- [x] 0002 Raycast API inventory generator
- [x] 0003 Coverage evidence join (`@covers` tags → report, staleness check)

### M1 — Headless vertical slice

One fixture extension command (List + Action + Clipboard.copy) runs in its own
Node child process, renders through a React reconciler into a serializable
scene, and is driven by a headless client: snapshot the scene, dispatch an
action, observe the clipboard capability request, survive a crash.

- [x] Process, protocol and scene model (`docs/decisions/0001`)
- [x] 0004 Protocol package: messages, validation, NDJSON framing
- [x] 0005 React reconciler publishing whole-scene snapshots
- [x] 0006 Minimal `@raycast/api` shim (List, ActionPanel, Action, Clipboard)
- [x] 0007 Runtime child-process entry over stdio
- [x] 0010 Runtime hardening: command mode, stdout guard, environment, prefs
- [x] 0008 Host: bundle, spawn, session, capability broker
- [x] 0009 `blast` debug CLI + end-to-end fixture test

### M2 — Real extensions

Run unmodified commands from `raycast/extensions` headlessly. Corpus pinned
at commit `3b812d1e` (3,443 extensions). No `npm install`: Blast provides one
shared copy of `@raycast/utils` for every extension.

- [x] 0011 Corpus fetch tool: pinned shallow sparse checkout + disk guard
- [x] 0012 Static API usage scan of the whole corpus → weights in `compat/`
- [x] 0013 Shared `@raycast/utils` and dependency policy for bundling
- [x] 0014 Curated smoke runner + report for the first 10 commands

First curated set (List-centric, UI API only, offline, deps ⊆ api/utils):
fibonacci-sequence, ohmyzsh-git-alias, axios-docs, radix,
px-to-rem-converter, ratio-calculator, code-review-emojis, biaodian,
markdown-reference, conventional-commits.

### M3 — Coverage to 100%

Goal: 100% of the non-deprecated `@raycast/api` surface, then deprecated
aliases. First step: export a stub for every inventory symbol that throws a
structured "unsupported in Blast" error when used, so missing APIs fail with
diagnostics instead of ESM link errors.

- [x] 0015–0035 done: stubs, curated blockers, navigation, detail metadata,
      feedback UI, list completeness, storage/open, Form, curated v2/v3, Cache,
      CJS globals, host capability APIs, assets layout, launch/window, Grid,
      menu bar, generated enums, no-hang feedback, Action variants, Submenu,
      selection/file APIs (see git log).
- [x] 0036 Corpus dependency usage scan
- [x] 0037 Shared dependency allowlist (interim, until v1)
- [x] 0038 Form.TagPicker, PasswordField, events and props
- [x] 0039 List and Grid prop completeness
- [x] 0040 Image, Keyboard and environment completeness
- [x] 0041 OAuth PKCE client
- [x] 0042 Form field refs, storeValue and drafts
- [x] 0043 AI, BrowserExtension and Tool APIs
- [x] 0044 WindowManagement and remaining leftovers
- [x] 0045 AI model provider entrypoint (protocol, host, CLI)
- [x] 0046 AI.ask with extension models, refreshModels, decide
- [x] 0047 Deprecated aliases — exports plus alias-aware coverage
- [x] 0049 Explicit alias map for structural deprecated duplicates
- [ ] 0048 Curated set v4 — extensions using shared dependencies

Smoke 2026-10-18 (`compat/SMOKE.md`, 60 extensions): 144/149 commands render,
1 completed, 4 expected capability denials, 0 unsupported-api. Coverage
2026-10-19: non-deprecated 1496/1534 covered, 38 partial (client-owned
filtering, menu-bar/HUD effects), 0 missing. Shared deps satisfy 2009/3443
corpus extensions. Each step is a task with `@covers` evidence.

### M4 — Desktop client

Choose client technology (decision record), render scenes, ship a Linux build.

## Later (not scheduled)

- Scheduled job that regenerates `compat/` against the newest `@raycast/api`
  and opens a PR with the diff.
- Autonomous orchestrator loop over `tasks/`.
- Delete `archive/`.

## Decision log

One line per decision; link a record only when it exists.

- 2026-10-18: Bun for dev toolchain; product code stays Node 24-runnable.
- 2026-10-18: Headless client first; desktop UI deferred to M4.
- 2026-10-18: Process/protocol/scene model accepted (`docs/decisions/0001`).
- 2026-10-18: Coverage denominator is the latest `@raycast/api` declarations.
- 2026-10-18: AI model providers run in their own runtime child (`docs/decisions/0006`).
- 2026-10-18: Extra npm deps: interim shared pinned allowlist until v1;
  production should reference each extension's own pinned deps via a thin,
  minimal-disk layer instead (0037 records it in `docs/decisions/0002`).
