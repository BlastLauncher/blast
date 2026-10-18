# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `v3/restart`. Keep this file under 120 lines; detail belongs in task
files.

## Current focus

M1 — headless vertical slice. 0004 and 0005 run in parallel; then 0006 →
0007 → 0008 → 0009.

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
- [ ] 0004 Protocol package: messages, validation, NDJSON framing
- [x] 0005 React reconciler publishing whole-scene snapshots
- [ ] 0006 Minimal `@raycast/api` shim (List, ActionPanel, Action, Clipboard)
- [ ] 0007 Runtime child-process entry over stdio
- [ ] 0008 Host: bundle, spawn, session, capability broker
- [ ] 0009 `blast` debug CLI + end-to-end fixture test

### M2 — Real extensions

- [ ] Sparse fetch of pinned `raycast/extensions` commands into `.cache/`
- [ ] Corpus API usage weights feed `compat/`
- [ ] Headless smoke run of a curated set of real commands

### M3 — Coverage expansion

Repeat: pick the highest-weight uncovered API, implement with tests, regenerate
`compat/`. Each step is a task.

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
