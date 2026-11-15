---
id: "0178"
title: "tmux plugin (examples/tmux-plugin) with a real-tmux e2e in CI"
status: review
milestone: M11
depends: ["0174", "0177"]
---

## Goal

`examples/tmux-plugin/` is a complete TPM plugin: adding
`set -g @plugin 'BlastLauncher/tmux-blast'` and pressing the key opens the
Blast palette in a popup; picking "Split Horizontal" splits the pane that
opened it and the popup closes.

## Context

- Decision 0016 point 4. Files: `blast.tmux` (TPM entry, executable bash),
  `scripts/palette.sh`, `README.md`, `LICENSE` (MIT). Options:
  `@blast-key` (default `C-Space`, no prefix; `off` skips), `@blast-key-table`
  (`root` default, or `prefix`), `@blast-extensions` (space-separated dirs),
  `@blast-popup-width`/`-height` (default 90 columns × 28 rows, full screen
  below 80 columns), `@blast-command` (default
  `bunx @blastlauncher/tui@next`, overridable to a local checkout for
  development). Pass the opening pane to the popup (e.g. `BLAST_TMUX_TARGET`
  as 0175 documents). Clear error in a tmux message when Bun is missing.
- tmux 3.2+ (`display-popup -E`); this machine has 3.2a.
- E2E (`scripts/tmux-plugin-e2e.ts`, `bun run example:tmux:e2e`, also a CI
  job): start an isolated server (`tmux -L <unique> -f <temp conf>`) that
  sources the plugin with `@blast-command` pointing at this checkout's
  `packages/tui/src/main.tsx`; `send-keys` the binding, type "split h",
  Enter; assert the pane count rose and no popup remains
  (`display-message -p '#{popup_active}'` or equivalent for 3.2). Also
  assert `@blast-key off` binds nothing.

## Acceptance

- [x] `bun run example:tmux:e2e` passes locally; CI job runs it.
- [x] Plugin README: install via TPM and manually, options table,
      requirements (tmux 3.2+, Bun), credit to Tmux Palette for the command list.
- [x] `bun run verify` passes.

## Out of scope

- Creating the separate repo (orchestrator), publishing.

## Handoff

```
Branch/commit: t3/add-tmux-plugin-e2e @ d99e763 (plus this handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 117.5s
Done:
- examples/tmux-plugin: blast.tmux (TPM entry, all six options) binds
  run-shell -b scripts/palette.sh, which checks Bun (PATH, then ~/.bun/bin;
  otherwise a tmux message), sizes the popup and opens display-popup -E with
  BLAST_TMUX_TARGET=session:window.pane exported in the command string.
- scripts/tmux-plugin-e2e.ts (bun run example:tmux:e2e): isolated -L servers,
  a client attached from a pane on a second server; checks C-Space -> "split h"
  -> Enter splits the opening pane and leaves no popup process or palette text,
  @blast-key off binds nothing, @blast-key-table prefix binds there, and
  missing Bun shows the message. Passed 4/4 locally on tmux 3.2a; a broken
  target makes it fail at the split wait.
- CI: new tmux-plugin job in ci.yml (installs tmux, runs the e2e).
- README (TPM + manual install, options table, requirements, credit) and LICENSE (MIT).
Not done / risks:
- CI job not yet run (workers do not push); runners get a newer tmux than 3.2a.
- tmux 3.2a has no display-popup -e or #{popup_active}, and its display-message
  -c takes no client argument; the binding passes #{client_width/height}, and
  "no popup" is checked as no server child besides pane shells (pgrep, Linux).
- Tmux Palette is credited by name only; no upstream URL was found in the repo.
```
