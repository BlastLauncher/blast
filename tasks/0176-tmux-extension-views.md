---
id: "0176"
title: "tmux extension II: find/move pane, choose session, rename and new forms"
status: todo
milestone: M11
depends: ["0175"]
---

## Goal

The `tmux` extension's interactive commands use Raycast views instead of tmux
prompts, so they work inside the Blast palette and any other Blast client.

## Context

- Builds on 0175 (`packages/tui/extensions/tmux`, its `tmux.ts` helper and
  real-tmux test harness).
- Commands:
  - Find Pane: List of every pane (`list-panes -a -F`) with session, window,
    title, current command and path; primary action switches to it
    (`switch-client -t` + `select-window` + `select-pane`); actions to zoom
    or kill it (kill confirmed).
  - Move Pane to…: List of windows (and "New window"); primary runs
    `join-pane -s <origin pane> -t <window>` (or `break-pane`).
  - Choose Session: List of sessions with window count and attached flag;
    primary `switch-client -t`; actions Rename, Kill (confirmed), New.
  - Rename Pane / Rename Window / Rename Session: Form prefilled with the
    current name, submit runs `select-pane -T` / `rename-window` /
    `rename-session`.
  - New Session: Form with name and optional start directory; submit
    `new-session -d -s <name> [-c dir]` then `switch-client -t`; validation
    error when the name exists.
- Every command ends with `closeMainWindow()` after its action, as 0175 does.

## Acceptance

- [ ] Real-tmux tests (same harness as 0175) for each command: list contents
      match `tmux list-*`, primary actions change tmux state, forms validate.
- [ ] `bun run verify` passes.

## Out of scope

- Themes, the plugin, publishing.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
