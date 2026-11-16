---
id: "0184"
title: Real blast-tui recording, played in the browser with ghostty-web
status: doing
milestone: M13
depends: []
---

## Goal

The site ships a real recording of `blast-tui` running as the tmux palette and a
small player module that replays it in a ghostty-web terminal, for the landing
page's Terminal view.

## Context

- **Recording script:** `bun run site:record-tui` (new `scripts/record-tui.ts` or under
  `examples/browser-demo/`) writes `examples/browser-demo/recordings/tui.cast` in
  asciicast v2 (header + `[time, "o", data]` events). It must drive the real thing:
  an isolated tmux server (`tmux -L <name>`, never the user's), fixed size 100×28,
  fixed `TERM=xterm-256color`, a neutral prompt/HOME/cwd with no personal paths or
  usernames, the plugin from `examples/tmux-plugin` (or `blast-tui --popup` in a
  `display-popup`, as `scripts/tmux-plugin-e2e.ts` does), and `tmux send-keys` with
  human-like delays for this storyboard:
  1. Ctrl+Space opens the palette; type `spl`; ↓; Enter → Split Vertical runs, pane splits.
  2. Ctrl+Space; type `rename`; Ctrl+A opens actions; Enter (Open Command) →
     Rename Window form; type `engine`; Enter → status bar shows the new name.
     Capture by attaching a client inside `script -q -T <timing> -O <log>` (util-linux),
     or any pty recorder that needs no new runtime dependency, then convert to asciicast.
     Trim idle gaps over 1.5 s. Reuse helpers from `scripts/tmux-plugin-e2e.ts`.
     The committed cast must contain no absolute home paths, hostnames or usernames
     (test it). Keep it under 300 KB.
- **Player:** `examples/browser-demo/tui-player.ts` exports
  `mountTuiPlayer(element: HTMLElement, castUrl: string): { dispose(): void }`. It loads
  `ghostty-web` (check `npm view ghostty-web version`, pin exactly, devDependency of
  `examples/browser-demo`, justify in Handoff), fetches the cast, creates a terminal
  of the cast's size that scales to the element width, replays events by timestamp,
  loops with a 2 s hold, pauses when the element is off-screen or the tab is hidden,
  and shows the final frame without playback under `prefers-reduced-motion: reduce`.
  Include a small Pause/Play control and a progress bar. Theme the terminal with the
  TUI's dark palette (`packages/tui/src/theme.ts`).
- **Site build:** `buildSite` bundles the player to `www/tui-player.js` (Bun.build,
  browser target; ghostty-web's wasm emitted next to it or inlined, whichever ghostty-web
  supports) and copies the cast to `www/tui.cast`. Task 0183 (in parallel) owns
  `landing.ts`; it lazy-imports `/tui-player.js` and calls `mountTuiPlayer`. Do not edit
  `landing.ts` or `site.test.ts`; put tests in `tui-player.test.ts` / a recording test.
- Recording needs tmux and Bun locally; it is not run in CI or `bun test`. Tests use
  the committed cast.

## Acceptance

- [ ] `bun run site:record-tui` regenerates `recordings/tui.cast`; the committed cast
      shows both scenes (test: the output contains `Split Vertical`, `Rename Window`, and
      `engine` in the status line).
- [ ] Test: the cast is valid asciicast v2 (header width/height, monotonic times) and
      contains no `/home/`, `/Users/`, or the recording machine's hostname/user.
- [ ] `bun run site:build` writes `www/tui-player.js`, its wasm (if separate) and `www/tui.cast`.
- [ ] A Playwright check (in `site-e2e.ts`, a separate block) loads a tiny test page that
      calls `mountTuiPlayer` on the built files and asserts the terminal renders text
      from the cast within 5 s; save a screenshot mid-playback and list it in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- The landing page layout and switch (0183); recording other scenes.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
