# Plan

Restarted 2026-10-18 from tag `archive/v2-prototype-2026-10-18`. Integration
branch: `v3/restart`. Keep this file under 120 lines; detail belongs in task
files.

## Current focus

M0 — workflow foundation. Next: `tasks/0002`.

## Milestones

### M0 — Workflow foundation

- [x] Archive prototype; new AGENTS.md, PLAN.md, task format
- [x] `bun run verify` gate and `check:workflow` guard
- [x] CI runs verify on push and pull request
- [x] 0001 Vendor latest `@raycast/api` declarations into `compat/`
- [ ] 0002 Raycast API inventory generator
- [ ] 0003 Coverage evidence join (`@covers` tags → report, staleness check)

### M1 — Headless vertical slice

One fixture extension command (List + Action + Clipboard.copy) runs in its own
Node child process, renders through a React reconciler into a serializable
scene, and is driven by a headless client: snapshot the scene, dispatch an
action, observe the clipboard capability request, survive a crash.

- [ ] Protocol + scene format (decision record)
- [ ] Extension runtime: reconciler + minimal `@raycast/api` shim
- [ ] Host: spawn, session, capability broker (deny by default)
- [ ] `blast` debug CLI: run a command headlessly, print scene, send events
- [ ] End-to-end test of the fixture through the CLI

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
- 2026-10-18: Coverage denominator is the latest `@raycast/api` declarations.
