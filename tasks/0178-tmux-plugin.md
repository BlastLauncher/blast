---
id: "0178"
title: "tmux plugin (examples/tmux-plugin) with a real-tmux e2e in CI"
status: doing
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

- [ ] `bun run example:tmux:e2e` passes locally; CI job runs it.
- [ ] Plugin README: install via TPM and manually, options table,
      requirements (tmux 3.2+, Bun), credit to Tmux Palette for the command list.
- [ ] `bun run verify` passes.

## Out of scope

- Creating the separate repo (orchestrator), publishing.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
