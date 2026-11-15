---
id: "0176"
title: "tmux extension II: find/move pane, choose session, rename and new forms"
status: doing
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
Branch/commit: t3/tmux-extension-views @ d22b229 (+ this Handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 142.4s
Done:
- Seven view commands in packages/tui/extensions/tmux: find-pane, move-pane,
  choose-session (Lists) and rename-pane, rename-window, rename-session,
  new-session (Forms; shared in forms.tsx). Each action ends in closeMainWindow().
- tmux.ts: fail/query/rows/useLoad helpers and confirmDestructive; tmux()
  takes `;`-chained commands (switch-client ; select-window ; select-pane).
- Forms validate: empty window/session name, existing session name (has-session -t =name).
- Real-tmux tests drive each view through the session scene (onAction,
  onChange, SubmitForm, Alert answers). `withServer({ client: true })` attaches a
  real client from a second isolated -L server so switch-client is tested.
Not done / risks:
- 0175's existing `break-pane` command runs `break-pane -t <pane>`; -t is the
  destination there, so tmux 3.2a fails with "can't specify pane here". It needs
  `-s <pane> -t <session>:` (as move-pane's New Window now does); left for a follow-up.
- switch-client relies on tmux's current-client resolution (the most recent
  client when TMUX_PANE is absent), like 0175's next/previous session.
- packages/tui/extensions is excluded from typecheck (unchanged).
```
