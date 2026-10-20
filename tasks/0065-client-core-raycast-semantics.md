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
Branch/commit: task-0065-client-core-semantics @ branch tip
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 94.1s
Done:
- client-core `rank.ts`: score (match quality exact > prefix > word prefix >
  substring dominates; title > keywords > subtitle breaks ties), `rankGroups`
  (keepSectionOrder, stable ties, empty query = declaration order), `filteringOf`.
  Used by List (`sceneToView`), `gridLayout`, dropdowns (`filterOptions`,
  new `visibleOptions`), `actionRows`/new `panelRows` (Submenu `filtering`), and
  new `formDropdownOptions` (+ `searchDispatch` works on any node).
- `shortcut.ts`: platform-aware `matchesShortcut`/`shortcutLabel` (macOS |
  Windows | Linux, default Linux), all modifiers, `{ macOS, Windows }` form,
  labels `⌘⇧K` / `Ctrl+Shift+K`. Off macOS `cmd` maps to Ctrl (my choice).
- `feedback.ts` (`feedbackState`: toast, HUD with popToRootType/clearRootSearch,
  alert with rememberUserChoice) and `menu-bar.ts` (`menuRows`, `menuBarView`,
  `menuBarStep` reducer); the TUI uses them (menu-bar.tsx keeps only rendering).
- Non-deprecated partials 38 -> 7 (`compat:report` clean); dropped ` partial`
  from runtime tags for the listed symbols (incl. dropdown `storeValue`, whose
  runtime persistence already exists), added tags in client-core tests.
Not done / risks:
- Remaining 7 partials are 0076's (SubmitForm, Alert.Options.rememberUserChoice,
  getContent, Cache directory, fallbackText).
- Visible TUI change: shortcut labels are now `Ctrl+A`, not `ctrl+a`. No TUI
  test needed changes; the TUI form/dropdown search UI is not wired to
  `formDropdownOptions` (form dropdowns still cycle options).
- Unsupported List children now render after the ranked items, not in place.
- `meta` is not folded into Alt off macOS; embedders must report Alt as `option`.
```
