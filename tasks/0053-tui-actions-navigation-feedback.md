---
id: "0053"
title: "TUI action panel, navigation, Detail, feedback UI"
status: doing
milestone: M4
depends: ["0052"]
---

## Goal

In `bun run tui`, Ctrl-K opens the selected item's action panel; pushed views
render and Esc pops them; `Detail` (markdown + metadata) renders; toasts, HUDs
and alerts show in the terminal and their actions work; clipboard and open
effects are answered by the TUI instead of being denied.

## Context

- Start from `packages/tui` (task 0052: `view.ts` is the pure scene→view layer,
  `app.tsx` the OpenTUI components, `session.ts` the host wiring). Read
  `docs/decisions/0007-terminal-client.md`, the "Scene conventions" section of
  `docs/architecture.md`, decisions 0003 (navigation) and 0004 (feedback), and
  `docs/capabilities.md`.
- Review finding carried from 0052: `packages/tui/src/session.ts` duplicates
  the broker wiring of `blast run` (`packages/host/src/cli.ts`). Extract a small
  shared host helper (e.g. `openSession` in `packages/host`) used by both, so
  session-scoped handlers stay identical; `blast run` behaviour and its tests
  must not change.
- Action panel: overlay listing the `actions` Slot of the selected item (or the
  view's own), with `ActionPanel.Section` titles, `ActionPanel.Submenu`
  (Enter opens, Esc closes), type-to-filter, shortcut labels from
  `Keyboard.Shortcut` props, Enter runs the action, Esc closes the panel.
  Actions with `shortcut` props are triggerable from the list when the key maps
  cleanly to a terminal key (record the mapping rule in docs/cli.md; skip
  unmappable ones).
- Navigation: render only the active `Navigation.Entry`; Esc on depth > 1 sends
  the pop (see how `Navigation.props.pop` is exposed); Esc on root quits as in 0052. Honour `popToRoot.clearSearchBar` / `clearSearchBar` by clearing the
  search input. `closeMainWindow` quits the TUI.
- Detail: markdown rendered as plain text (OpenTUI `markdown`/`code` elements
  only if they work without the optional peers; otherwise text) with
  `Detail.Metadata.*` as label/value lines; `List.Item.Detail` shown as a side
  pane when `isShowingDetail`.
- Feedback: Toast (style, title, message, primary/secondary actions on a key),
  HUD (transient line), Alert (modal with confirm/dismiss `Alert.Action`s).
- Client handlers (passed into the shared helper): `clipboard.copy|paste|read|clear`
  backed by an in-memory clipboard (no system clipboard dependency), `open.url`
  printing/recording the URL rather than launching a browser. Others stay
  denied. Record the rule in docs/capabilities.md.
- Tests via `@opentui/react/test-utils` with existing fixtures
  (`actions-variants`, `feedback`, `list-extras`, `hello-list`); add a fixture
  only if none covers push/pop. Pure logic stays in `view.ts`-style modules.

## Acceptance

- [ ] Test-renderer tests: Ctrl-K panel lists sections/actions, filter + Enter
      runs an action; submenu open/close; push then Esc pops; Detail frame
      shows markdown text and metadata; toast/HUD/alert render and an
      `Alert.Action` dispatches.
- [ ] `blast run` uses the shared helper; existing host/cli tests unchanged and green.
- [ ] Handoff describes a manual PTY run of an `actions-variants` command.
- [ ] `bun run verify` passes.

## Out of scope

- Form and Grid (0054), images/icons beyond a glyph, menu-bar commands,
  system clipboard or real browser launch, new runtime/protocol messages.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
