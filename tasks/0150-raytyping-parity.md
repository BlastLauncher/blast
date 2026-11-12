---
id: "0150"
title: Raytyping works in the browser demo like it does in the TUI
status: doing
milestone: M8
depends: []
---

## Goal

"Start Raytyping" (extension `raytyping`, command `raytype`) is playable in
the browser demo: you type into the same search field the game reads, and
every piece of information the TUI shows is visible in the browser.

## Context

- User report: "Raytyping doesn't work in the same box. Some information
  is not displayed, unlike the TUI version."
- Start by running the command in both clients against the same corpus
  checkout (`bun run corpus:*` scripts; the TUI is `packages/tui`) and
  writing down, side by side, which scene props each client renders: search
  bar text/placeholder, `List.Item` title/subtitle/accessories,
  `List.Item.Detail` markdown/metadata, `navigationTitle`, empty view,
  toasts, `isShowingDetail`, `onSearchTextChange` / `searchText`
  (controlled search), `filtering`, `throttle`. The gap is in Blast, never
  in the extension source.
- Browser rendering: `examples/web-launcher/render.js`, `client.ts`
  (`draw`, search input handling, early keystrokes), client-core
  (`packages/client-core/src/view.ts`, `search.ts`). A fix in client-core
  benefits every client; keep the TUI unchanged unless it is also wrong.
- Likely suspects: controlled `searchText` not written back into the input
  (so the game's text and the typed text diverge), a detail pane or
  accessory not rendered in the browser, and `draw` replacing the input
  while typing.

## Acceptance

- [ ] Handoff has the side-by-side table (prop → TUI → browser before →
      after) and the root cause of each gap.
- [ ] Tests in client-core and/or `render.test.ts` cover each fixed prop
      with a fixture scene (no network in `bun test`).
- [ ] `site-e2e.ts` (or a fixture modelled on Raytyping's view shape, if
      the real extension cannot run in CI) types a few characters and
      asserts the game state shown on screen advances, with the text typed
      in the same search field the extension reads.
- [ ] Screenshots of Raytyping mid-game in the browser and the TUI, listed
      in Handoff.
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes; `compat/` regenerated if `@covers` changed.

## Out of scope

- Modifying the extension; layout polish (0149); showcase (0151).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
