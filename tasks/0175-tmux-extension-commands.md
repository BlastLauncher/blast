---
id: "0175"
title: "tmux extension I: one-shot pane, window, session and system commands"
status: doing
milestone: M11
depends: []
---

## Goal

A Blast-authored Raycast extension `packages/tui/extensions/tmux` runs Tmux
Palette's one-shot commands against the tmux client that opened the palette,
tested against a real, isolated tmux server.

## Context

- Decision 0016 point 2. Command list (names from Tmux Palette, MIT;
  reimplement, copy no code), each a `no-view` command that runs `tmux` with
  `execFile` and then `closeMainWindow()`:
  - Panes: Split Horizontal (`split-window -h -c '#{pane_current_path}'`),
    Split Vertical (`-v`), Close Pane (`kill-pane`), Next/Previous Pane
    (`select-pane -t +1/-1`), Display Pane Numbers (`display-panes`), Cycle
    Pane Layout (`next-layout`), Swap Pane Up/Down (`swap-pane -U/-D`),
    Zoom / Unzoom (`resize-pane -Z`), Enter Copy Mode (`copy-mode`), Break to
    New Window (`break-pane`).
  - Windows: New Window (`new-window -c …`), Next/Previous/Last Window.
  - Sessions: Next/Previous Session (`switch-client -n/-p`), Detach
    (`detach-client`).
  - System: Reload Config (`source-file` of `~/.tmux.conf`, or
    `$XDG_CONFIG_HOME/tmux/tmux.conf` when that exists; `showHUD` result).
  - Destructive, with `confirmAlert` first: Close Other Panes (`kill-pane -a`),
    Close Window (`kill-window`), Kill Session (`kill-session`).
- Targeting: inside `display-popup` the env has `TMUX`; commands must act on
  the pane/window/client that opened the popup, not on the popup. Find the
  right target (e.g. `{last}`/client of `TMUX_PANE`, or a
  `BLAST_TMUX_TARGET` env the plugin passes) and document it in the
  extension README. Outside tmux, every command shows a failure toast
  "Not inside tmux".
- Layout like `examples/browser-demo/showcase` (Raycast `package.json`
  manifest with an icon, `src/*.tsx`, excluded from the repo typecheck). Only
  `@raycast/api`; no npm dependencies. One small shared `tmux.ts` helper.
- Tests: `packages/tui/src/tmux-extension.test.ts` starts `tmux -L <unique>
  -f /dev/null new-session -d`, runs commands through the engine
  (`openExtension` + `launch`) with `TMUX` pointing at that server, and
  asserts the resulting tmux state (`list-panes -F`, `display-message -p`).
  Skip with a clear message when `tmux` is not installed; add `tmux` to the
  CI verify job (`apt-get install -y tmux`).

## Acceptance

- [ ] Every command above exists in the manifest with title, description and
      keywords; tests cover at least splits, zoom, new/next window, a
      confirmed and a cancelled destructive command, and the "Not inside
      tmux" path.
- [ ] CI installs tmux; `bun run verify` passes.

## Out of scope

- List/form commands (0176), themes, the plugin, publishing.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
