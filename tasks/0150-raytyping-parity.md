---
id: "0150"
title: Raytyping works in the browser demo like it does in the TUI
status: review
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

- [x] Handoff has the side-by-side table (prop → TUI → browser before →
      after) and the root cause of each gap.
- [x] Tests in client-core and/or `render.test.ts` cover each fixed prop
      with a fixture scene (no network in `bun test`).
- [x] `site-e2e.ts` (or a fixture modelled on Raytyping's view shape, if
      the real extension cannot run in CI) types a few characters and
      asserts the game state shown on screen advances, with the text typed
      in the same search field the extension reads.
- [x] Screenshots of Raytyping mid-game in the browser and the TUI, listed
      in Handoff.
- [x] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [x] `bun run verify` passes; `compat/` regenerated if `@covers` changed.

## Out of scope

- Modifying the extension; layout polish (0149); showcase (0151).

## Handoff

```
Branch/commit: t3/raytyping-parity-r2 @ 2a57ec6 (fix); this Handoff commit follows it
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 109.0s
Done:
- render.js draws a List's isShowingDetail pane (markdown + metadata) beside the rows.
- replaceApp keeps the old focused control but copies the new markup's attributes onto it.
- draw writes controlled searchText into the focused field when the controller moved it.
- browser-typing fixture (Raytyping's view shape); e2e in both lanes; unit tests.
Not done / risks: see below.
```

Observed by running `raytyping`/`raytype` (corpus `bad7de01`) in the TUI test
renderer and in the browser demo (Chromium, corpus copy served as a local
fixture), typing a whole round, then Enter (Reload).

| Prop                                                            | TUI                                              | Browser before                                       | Browser after                 |
| --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- | ----------------------------- |
| `searchBarPlaceholder` "Type here"                              | shown                                            | "Search…"                                            | shown                         |
| typed `searchText` → `onSearchTextChange`                       | wpm advances                                     | wpm advances                                         | same                          |
| `searchText` set by the extension ("" at round end, Reload)     | field clears                                     | old text stays; next round appends and never matches | field clears                  |
| `isShowingDetail` + `List.Item.Detail.markdown` (the test text) | right pane                                       | not drawn: nothing to type against                   | right pane, typed prefix bold |
| `List.Item.Detail.metadata` (Speed, Accuracy)                   | lines under markdown                             | not drawn                                            | paragraphs under markdown     |
| `List.Item` title, icon `tintColor`                             | "N wpm", green/red ◷                             | same                                                 | same                          |
| `isLoading`                                                     | "Loading…" footer                                | header loader                                        | same                          |
| `searchBarAccessory` dropdown "10 words"                        | shown                                            | shown                                                | same                          |
| `filtering` / `throttle`                                        | unset: no filtering (controlled), every key sent | same                                                 | same                          |
| `navigationTitle`, EmptyView, toasts                            | not used by Raytyping                            | —                                                    | —                             |

Root causes:

1. Detail: `render.js` drew `view.detail` only for `kind === "detail"`. The
   controller already gives a list's detail (same string the TUI draws).
2. Placeholder: `replaceApp` swaps the previous focused `#search` back in to keep
   focus/caret, discarding the new element's attributes. The first draw (before
   the List's props) said "Search…", and that element stayed for the session.
3. Same field: `replaceApp` never writes a focused control's value, so the
   extension's `searchText` reset never reached the field. Fix
   (`search-sync.ts`): write `view.search.text` only when it differs from the
   field and from `searchBaseline`, the controller's text after the field's
   last input or sync. Each key updates the field and the controller in one
   task, and client-core ignores echoes that lag behind typing, so the
   controller only moves on its own when the extension changed the text. This
   rule cannot drop a key, unlike round 1's every-draw overwrite. Skipped while
   an IME composition is open.

Proof: the e2e types "red" then " fox jumps" at full speed into the focused
field, checks the bold progress, the cleared field with "Rounds: 1", Reload,
and a second round in the same field. In Docker
(`mcr.microsoft.com/playwright:v1.58.0-noble`), Chromium and Firefox both pass
(`{"pass":true,…}`). It fails with base `client.ts`+`render.js` (no
`.list-split > article.detail`), with base `client.ts` only (placeholder
"Search…"), and with only the search sync removed ("did not finish": field kept
"red fox jumps").

Screenshots/frames (`.cache/raytyping-obs/`, not committed): browser
`after-midgame.png`, `after-finished.png`, `after-reloaded.png`,
`before-midgame.png`; TUI `tui-midgame.png`, `tui-finished.png` (from
`tui-midgame.txt`, `tui-finished.txt`); logs `before.log`, `after.log`,
`docker-e2e-*.log`.

Risks / follow-ups:

- macOS host Chromium `site:e2e` fails at the 0147 root-list scroll check ("↓
  did not bring the .root-options selection into view") on base `47b2910`
  too; it passes on Linux. Not in CI (only Firefox runs there).
- Keys typed before the first scene are still dropped for controlled search
  (0137 excludes them on purpose); Raytyping starts empty, so unaffected.
- The playwright image was left in place: another session's container used it.
- `bundle.test.ts` "engine deadlines inherit…" failed twice under load (4.8 s
  of a 5 s budget alone); verify passed on the third run.
