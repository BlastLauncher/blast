---
id: "0151"
title: Showcase section that demonstrates each capability
status: doing
milestone: M8
depends: []
---

## Goal

The production demo's root list opens with a "Showcase" section of small,
original Blast-authored commands, one per capability, so a visitor can try
List, Detail markdown, Form, Grid, actions, feedback, storage and menu bar
in a minute without hunting through the catalog.

## Context

- Existing fixtures under `fixtures/extensions/` (`hello-list`,
  `browser-form`, `browser-fields`, `browser-grid`, `browser-feedback`,
  `browser-keyboard`, `browser-modes`, `browser-preferences`,
  `browser-storage`, `menu-bar`) are test fixtures, shipped only with
  `--fixtures` (`examples/browser-demo/site.ts`). Do not repurpose them
  for production; tests depend on their exact content.
- Add one showcase extension under `examples/browser-demo/showcase/` (MIT,
  written for Blast, `@raycast/api` imports only) with commands such as:
  List with detail pane and accessories; Detail with rich markdown
  (headings, code, table, image) and metadata; Form with every field type
  and validation; Grid with sections; Actions (submenu, shortcuts, copy,
  open URL, push a view); Feedback (toast, HUD, alert); Storage
  (LocalStorage/Cache that survives relaunch); a menu-bar command. Keep the
  copy short and explain what each demonstrates.
- Ship it in the production build (prebuilt like other bundles), add a
  root section "Showcase" above Suggestions (`root.ts` sections) with a
  short subtitle per command, and keep catalog commands below.
- Only use capabilities the browser host supports today; the sweep and
  `capabilities.ts` say which.

## Acceptance

- [ ] The production site build (no `--fixtures`) lists the Showcase
      section first; `site.test.ts` asserts it.
- [ ] `site-e2e.ts` opens each showcase command and asserts its key content
      (markdown heading, a form field, a grid cell, a toast, the menu
      dropping from the top bar, a stored value after relaunch).
- [ ] Screenshots of each showcase command (light and dark), listed in
      Handoff.
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes; `compat/` regenerated only via generators.

## Out of scope

- New host capabilities; layout polish (0149); Raytyping (0150).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
