---
id: "0120"
title: Raycast-style root list to pick and run an extension command in the browser demo
status: doing
milestone: M8
depends: []
---

## Goal

The browser demo opens on a launcher-style root list instead of a URL box.

- **Search:** you search across extension commands and pick one with the
  keyboard, and it runs in place.
- **Back:** Esc at the extension's root returns to the list.
- **Look and feel:** it should feel like Raycast's root search (fast, ranked,
  keyboard-first, with an action panel), in our own visual design.

## Context

- **Demo:** `examples/browser-demo/` (0119):
  - `client.ts` (host page);
  - `source.ts` (GitHub and fixture source parsing, tested);
  - `e2e.ts` (headless Chromium; `PLAYWRIGHT_BROWSERS_PATH` must point at the
    existing cache).
- **Ranking:** use `packages/client-core/src/rank.ts` (`score`, `rankGroups`),
  the same Raycast-style ranking the TUI uses.
- **Renderer:** `examples/web-launcher/render.js`. Extension views keep using
  it, restyled to match the root list.
- **Catalog source:**
  - `compat/smoke.json`: 237 rendered commands across 99 extensions, pinned
    to its `commit`.
  - Drop extensions whose dependencies in `compat/corpus-deps.json` need native
    code or a shell, e.g. `execa`, `run-applescript`, anything with native
    modules. List the deny rule in the script.
- **Generator:** `scripts/browser-catalog.ts`, run as `bun run
  example:browser-demo:catalog`.
  - **Network:** an explicit network script. It fetches each extension's
    `package.json` at that commit from `raw.githubusercontent.com`.
  - **Output:** `examples/browser-demo/catalog.json`, holding
    `{commit, extensions:[{name, title, description, icon, commands:[{name,
    title, subtitle?, mode}]}]}` with only the smoke-rendered commands.
  - **Determinism:** sorted, so rerunning on the same commit gives the same
    bytes.
  - **Licensing:** metadata only (raycast/extensions is MIT); no source or
    assets are committed.
  - **Icons:** loaded at runtime from the raw URL, with a neutral fallback
    glyph when missing.

## UX (match Raycast's interaction model, our own look)

- **Search:** a field at the top ("Search extension commands…"), focused on
  load.
- **Rows:**
  - each row has an icon, the command title, the extension title as
    subtitle, and a right-aligned accessory ("Command");
  - rows are ranked with client-core `score`;
  - an empty query shows "Suggestions": the first ~8 commands of a small
    curated set, plus the rest alphabetically.
- **Keys:**
  - ↑/↓ moves the selection, which stays visible while scrolling;
  - Enter runs the command;
  - ⌘K / Ctrl-K opens an action panel with "Run Command", "Open Extension on
    GitHub" and "Copy Extension URL";
  - Esc closes the panel, else clears the search.
- **Footer bar:** the selected row's primary action with "↵", and "Actions ⌘K".
  It also shows a status or toast while installing and bundling.
- **Running a command:**
  - the panel swaps to the extension's view, with a breadcrumb showing the
    extension and command;
  - Esc at the extension's navigation root goes back to the root list and stops
    the sandbox session;
  - re-running starts fresh.
- **Run from URL:** a query that parses as a GitHub extension URL (via
  `source.ts`) adds a top row, "Run from URL".
- **Deep link:** `?ext=<name>&cmd=<command>` opens a command directly.
- **Styling:**
  - one stylesheet for the root list and for extension views: a dark rounded
    panel, about 40px rows, a highlighted selected row, the footer bar, and
    system fonts;
  - `prefers-color-scheme` light support;
  - no Raycast logos, brand assets or copied CSS.
- **Accessibility:** a listbox/option ARIA pattern, `aria-activedescendant`,
  and the visible selection must not depend on colour alone.

## Acceptance

- [ ] Pure tests, in verify:
  - [ ] the root list model handles ranking order, the suggestions fallback,
        the URL row, and selection clamping;
  - [ ] `renderRoot()` HTML is escaped and has ARIA roles;
  - [ ] the catalog's schema is valid, it is sorted, and every command exists
        in `compat/smoke.json`.
- [ ] Default e2e, offline with fixtures and a fixture catalog:
  - [ ] the root list renders;
  - [ ] typing filters it;
  - [ ] ↓ and Enter run the fixture command, whose first scene appears;
  - [ ] Esc returns to the root list;
  - [ ] ⌘K shows the three actions;
  - [ ] `?ext=&cmd=` opens a command directly.
- [ ] `--live` e2e: pick `ratio-calculator` from the real catalog, and its
      first scene renders.
- [ ] `catalog.json` is generated and committed; the Handoff records its size
      and count.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- 127.0.0.1 servers, always closed.
- Never touch the real clipboard; fake it in the e2e.
- Network only in the catalog script and `--live`.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- Hosting or deployment.
- Favourites, history or persistence beyond the URL.
- A browser compatibility sweep.

## Handoff

```
Branch/commit: t3/browser-root-actions @ 07dc051342bbea7e0fa1a8006c1cae1064a41146
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 67.0s
Done:
- Added the catalog-backed, ranked browser root list with suggestions, URL rows, keyboard selection, action panel, ARIA listbox markup, light/dark styling, and runtime icon fallbacks.
- Added the deterministic catalog generator and committed catalog.json (56,654 bytes; 99 extensions; 237 rendered commands; pinned to the smoke commit).
- Added deep links, fixture-catalog default e2e coverage, command launch from the real install/bundle/sandbox path, and session teardown/back navigation.
- Added pure model and renderer tests.
- Replaced the decorative root action panel with a filtered, keyboard-navigable model and ARIA listbox, including Run, GitHub, and copy effects with clipboard toast feedback.
- Extended e2e coverage with stubbed clipboard/window.open assertions; default e2e passed in 2,640 ms transferring 17,446,329 bytes, and `--live` passed in 13,545 ms transferring 17,500,777 bytes using ratio-calculator.
Not done / risks: none known.
```
