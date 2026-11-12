---
id: "0151"
title: Showcase section that demonstrates each capability
status: review
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

```
Branch/commit: t3/capability-showcase-extension @ 6729467 (feature commit; this Handoff commit follows it)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 116.2s
Done:
- examples/browser-demo/showcase/: MIT `blast-showcase` extension, 8 commands
  (list, detail, form, grid, actions, feedback, storage, menu), `@raycast/api` only.
- site.ts `siteCatalog()` adds it from its manifest to every build (`showcase: true`);
  prebuild.ts `local` option builds it from the repo, never the corpus.
- root.ts `rootSections()`: Showcase first, then Recent/Suggestions/Commands (no
  duplicates); client.ts drawRoot calls it. Showcase rows link to the Blast repo.
- site.test.ts asserts the production (no --fixtures) catalog opens with Showcase in
  manifest order and every showcase bundle is prebuilt.
- showcase-e2e.ts (called from site-e2e.ts in both lanes) opens each command and checks
  a markdown heading, form fields + validation + toast, grid cells, submenu/shortcut/
  open URL/push, toast/HUD/alert, a count that grows after a reload, and the menu under
  the status item. `--screenshots <dir>` saves light/dark shots.
- Chromium `bun run site:e2e` passed; Firefox lane passed in Docker
  (mcr.microsoft.com/playwright:v1.58.0-noble; image deleted afterwards).
Screenshots (light + dark, from `site:e2e --screenshots`): root, list, detail, form,
grid, actions, feedback, storage, menu — `<name>-light.png` / `<name>-dark.png`
(18 files, kept outside the repo).
Not done / risks:
- The browser host does not render Detail metadata, List detail panes, tables or
  fenced code. The showcase leaves them out, since new host capabilities are out of scope.
- Showcase rows reuse the fixture launch path (an internal raycast-tree-style source
  keyed by name). If the prebuilt bundle is missing, the GitHub fallback 404s.
- client.ts change is limited to drawRoot's sections (may conflict lightly with 0149).
```
