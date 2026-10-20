---
id: "0065"
title: client-core completes Raycast client semantics (ranking, keepSectionOrder, dropdown search, platform shortcuts, feedback lifecycle)
status: doing
milestone: M5
depends: []
---

## Goal

`@blastlauncher/client-core` implements the Raycast client behaviour that is
still `partial` in `compat/COVERAGE.md`, with pure tests that carry `@covers`
evidence. An embedder that renders client-core's model behaves like Raycast.

## Context

- Decision `docs/decisions/0009` (point 4). Package: `packages/client-core`
  (framework-free: no `node:`, React, OpenTUI or host imports).
- Current partial tags: `rg -n "@covers .* partial" packages`. This task owns
  these client-side ones:
  - `List`, `List.Props`, `Grid`, `Grid.Props` with `.filtering`,
    `.filtering.keepSectionOrder`;
  - `List.Dropdown`/`Grid.Dropdown`/`Form.Dropdown` with `.filtering`,
    `.filtering.keepSectionOrder`, `Form.Dropdown.Props.onSearchTextChange`;
  - `ActionPanel.Submenu` with `.filtering`, `.filtering.keepSectionOrder`;
  - `MenuBarExtra`, `MenuBarExtra.Props.isLoading`;
  - `showHUD`, `confirmAlert`.
    Engine-side partials (rememberUserChoice persistence, `fallbackText`,
    `Cache.Options.directory`, `BrowserExtension.getContent`,
    `Action.SubmitForm`, `PasteAction`) belong to task 0076. Leave them alone.
- Ranking: today `matchesQuery` is a substring filter that keeps declaration
  order. Implement Raycast-like ranking in a `rank.ts`:
  - score each item by best field (title > keywords > subtitle), with exact >
    prefix > word-prefix > substring;
  - order items by score, ties keeping declaration order;
  - without `keepSectionOrder`, sections are ordered by their best item;
    with `filtering: { keepSectionOrder: true }`, sections keep declaration
    order and only the items inside each section are ranked;
  - an empty query keeps everything in declaration order;
  - `filtering: false` or an `onSearchTextChange` handler disables
    client filtering, as now.
    Use it in `sceneToView` (List), `gridLayout`, the dropdown option filter,
    `actionRows` / submenu filtering, and a new form-dropdown option filter
    (`formDropdownOptions(field, query)` in `form-view.ts`, plus
    `onSearchTextChange` dispatch via `searchDispatch`).
- Shortcuts: `matchesShortcut` / `shortcutLabel` (`view.ts`) only know
  ctrl/shift. Make them platform-aware:
  - add a `platform: "macOS" | "Windows" | "Linux"` parameter (default
    `"Linux"` so the TUI keeps working);
  - support every `Keyboard.KeyModifier` (`cmd`, `ctrl`, `opt`, `shift`,
    `alt`, `windows`) and the `{ macOS, Windows }` cross-platform form (Linux
    uses the `Windows` variant);
  - support `Keyboard.Shortcut.Common.*` values as the runtime passes them;
  - labels use platform glyphs on macOS (`⌘⇧K`) and `Ctrl+Shift+K` text
    elsewhere.
    `KeyInput` gains `meta`/`super` semantics: macOS `cmd` = `meta`, Windows key
    = `super`. Read the vendored declarations in `compat/raycast-api/` for the
    exact key and modifier names.
- Feedback lifecycle, as data the client renders:
  - `feedbackState(scene)` returns the visible toast, HUD and alert, plus the
    HUD's requested `popToRootType` / `clearRootSearch` effect and the alert's
    `rememberUserChoice` flag;
  - `menuBarView(scene)` returns menu rows with section headers,
    submenu/back navigation as a pure reducer, and `isLoading`. Lift the logic
    out of `packages/tui/src/menu-bar.tsx` / `app.tsx` and keep the TUI
    rendering identical.
- Move the matching `@covers` tags to the new client-core tests and drop the
  ` partial` suffix only where the behaviour is now complete. Run
  `bun run compat:report` and commit `compat/`.
- Keep the TUI working on the new APIs. Its tests may change only where the
  visible order legitimately changes because of ranking; list those in
  Handoff.

## Acceptance

- [ ] `packages/client-core/src/rank.test.ts` covers:
  - exact/prefix/word/substring ordering;
  - ties stable;
  - keywords and subtitle weighting;
  - sections reordered without `keepSectionOrder` and kept with it;
  - an empty query keeping declaration order.
- [ ] Shortcut tests cover:
  - macOS/Windows/Linux with every modifier;
  - the `{ macOS, Windows }` form;
  - labels per platform.
- [ ] Feedback and menu-bar model tests, with the TUI using them.
- [ ] `compat/COVERAGE.md` non-deprecated partial count drops (state
      before → after in Handoff); `bun run compat:report` leaves no diff.
- [ ] `bun run verify` passes.

## Out of scope

- Engine-side partials (0076), `blast serve` (0066), visual TUI changes.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
