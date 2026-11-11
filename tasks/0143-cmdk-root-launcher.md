---
id: "0143"
title: Demo root list is a cmdk launcher
status: doing
milestone: M8
depends: ["0142"]
---

## Goal

The demo's root command list feels like a complete launcher. It is built
on cmdk's `Command` components, with sections, recent commands, tighter
search, and clear loading and unavailable states.

## Context

- Today the root list is plain HTML strings: `renderRoot` in
  `examples/web-launcher/render.js`, driven by `drawRoot` and the key handling
  in `examples/browser-demo/client.ts`. Rows and ranking are built in
  `examples/browser-demo/root.ts`, and only cmdk's scorer is used
  (`cmdk-score.ts`). `cmdk`, `react` and `react-dom` are already
  dependencies of the demo package.
- Problems seen on blast.yukai.dev (2026-11-11):
  - Every row's accessory says "Command".
  - Searching "nano snake" also lists Shorten Link, RTL Text Formatter and
    Dice Tiles.
  - There are no sections and no recent commands.
  - The status line says "Ready" or "Starting…" and nothing more.
- Only the root view moves to cmdk. Extension views (List, Grid, Detail and
  Form scenes) keep their current renderer, but must look consistent with
  the new root: same window, footer and keyboard hints.
- `compat/browser-sweep.json` knows which commands cannot work in a tab:
  `runtime-error` from missing native apps or selection, and
  `needs-preferences`. Use that data, or a small generated subset of it
  that ships with the site, to mark those rows. Do not hard-code
  extension names.
- Keep `site-e2e.ts` and `browser-sweep.ts` working. They find rows and
  the search input through selectors, so update them in the same change if
  the markup changes.
- If the diff grows past about 600 lines, stop at a coherent point and
  write the remaining work in Handoff.

## Acceptance

- [ ] The root view renders through cmdk's `Command`, `Command.Input`,
      `Command.List`, `Command.Group`, `Command.Item` and `Command.Empty`
      (React 19, mounted only while the root is open).
- [ ] Sections: "Recent" shows up to 5 recently launched commands, stored in
      `localStorage` and wrapped in try/catch. "Suggestions" shows the
      curated set. "Commands" shows the rest. While searching, results are
      one ranked list without sections.
- [ ] Search requires every query word to match title, extension title or
      keywords. A unit test shows that "nano snake" returns
      `nano-games/play-nano-snake` and none of Shorten Link, RTL Text
      Formatter or Dice Tiles.
- [ ] Each row's accessory shows the command mode ("Command", "No View" or
      "Menu Bar"). Rows the sweep marks as unable to work in a tab carry a
      muted "Needs macOS" or "Needs setup" badge, and selecting one still
      launches it.
- [ ] Keyboard: ↑/↓ and ⌃N/⌃P move the selection, ↵ runs the command, ⌘K
      opens the existing root actions (Run, Open on GitHub, Copy URL), and
      Esc clears the query. `site-e2e.ts` covers each of these, plus
      launching from "Recent".
- [ ] While a command starts, the window shows the extension icon and
      title with a progress indicator and the current stage (fetching,
      bundling, starting), not a bare "Starting…".
- [ ] The page works at 375px wide with no horizontal scroll and supports
      light and dark color schemes.
- [ ] Chromium and Firefox e2e (from 0142) pass, and
      `bun run site:sweep:browser` totals do not regress.
- [ ] `bun run verify` passes.

## Out of scope

- Rewriting extension scene renderers in React.
- A preferences editor (the 51 `needs-preferences` commands).
- Changes to the landing page (`site.ts` home section).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/fix-cmdk-launcher-round2 @ a27cfdec8fd0d8e1efaaa445314e9b75b7d116f2
Verify: `bun run verify` completed format, lint, typecheck, compat, protocol, fixtures and workflow; the full suite hit the documented heavy-load timeout in `packages/host/src/bundle.test.ts` (`engine deadlines inherit through handles and launch overrides win`). Isolated rerun hit the same 5-second deadline under load.
Done:
- Replaced the root HTML list with a React 19 cmdk launcher using Command, Input, List, Group, Item and Empty.
- Added recent, suggestions and commands sections, localStorage persistence, multi-word matching, command mode accessories and generated sweep badges.
- Preserved staged launch status and generation/port handshake behavior, with an icon and stage-aware loading view.
- Updated responsive/light-dark launcher styling, action popover, generated badges and enrichment tests.
- Browser sweep completed 237 commands in 74.6s; totals remain rendered 104, completed 3, network 4, empty 2, missing-arguments 1, needs-preferences 51, runtime-error 72.
Not done / risks: Chromium e2e still reports the pre-existing selected-option visibility check after 30 moves; Firefox lane and requested screenshot capture were not completed in this round. Full verify should be rerun on a less-loaded host to clear the known 5-second bundle test deadline.
```
