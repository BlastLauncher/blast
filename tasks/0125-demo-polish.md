---
id: "0125"
title: "Demo polish: fixed-height launcher panel, extension context, status in the footer"
status: doing
milestone: M8
depends: []
---

## Goal

The `/demo/` launcher looks and behaves like a launcher window, not a long web
page:

- **Fixed-size panel.** A centred panel, about 750×475 on desktop and the
  full viewport on mobile.
  - The search bar and footer stay put.
  - Only the list area scrolls.
  - The selected row is kept in view with `scrollIntoView({block: "nearest"})`.
- **Context while a command runs.**
  - The header shows a breadcrumb, extension title › command title, with the
    extension icon.
  - The footer action bar shows the primary action (↵) and "Actions ⌘K", as
    on the root list.
  - An empty list shows the extension's empty view, or a neutral "No results"
    hint.
- **Status in the footer.**
  - "Fetching extension…", "Installing…", "Bundling…" and "Starting…" appear
    in the footer's left side with a small progress indicator, not floating
    above the panel.
  - Errors appear there too, in an error style, with a "Back" hint.
  - The stray status paragraph above the panel is removed.
- **Shared styling.** The same panel styling for the root list and extension
  views, in light and dark. Our own design, no Raycast brand assets.

## Context

- `examples/browser-demo/`:
  - `template.ts` and `demo.css` (shared page and stylesheet, 0124);
  - `root.ts` (root list model and render);
  - `client.ts` (status, launch, extension view);
  - extension views drawn by `examples/web-launcher/render.js`.
- The live site was screenshotted after 0124: the root list rendered all 237
  rows as a page about 10,700 px tall.
- 0126 runs in parallel and changes how commands are loaded (prebuilt
  bundles). Keep launch-path changes in `client.ts` to status reporting only.

## Acceptance

- [ ] Unit tests:
  - [ ] root/extension view HTML includes the breadcrumb and footer;
  - [ ] the status model maps each stage to its footer text;
  - [ ] the error state renders in the error style.
- [ ] `bun run site:e2e` passes, and additionally asserts:
  - [ ] the panel height is at most 520px at a 1280×800 viewport, with 237
        options, and `document.scrollingElement.scrollHeight` is at most the
        viewport height plus 1;
  - [ ] after pressing ↓ 30 times, the selected option is inside the list's
        visible rect;
  - [ ] while a command runs, the breadcrumb shows the fixture's title.
- [ ] `bun run site:smoke:browser` against a local production build passes.
      Attach dark, light and mobile screenshots (`.cache/site-smoke/`) by listing
      their paths in the Handoff.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; never write absolute
  personal paths into files; never download Chromium.
- Stub `navigator.clipboard` and `window.open`.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- Prebuilt bundles and load time (0126).
- New launcher features.

## Handoff

```
Branch/commit: t3/polish-demo-launcher-ui @ 61fc02603f4808d0c008c72e6324bd47d91e0a9c
Verify: verify passed locally (949 pass, 1 skip; format, lint, typecheck, compat, protocol, mac-fixtures, workflow all passed)
Done:
- Fixed the demo launcher to a centered 750×475 desktop panel and full viewport mobile panel with a scroll-only option list.
- Added extension breadcrumb context, footer primary/action hints, loading progress, and footer error status with Back hint.
- Added deterministic status/render unit coverage and browser assertions for panel height, scrolling selection, and breadcrumbs.
- Captured screenshots: `.cache/site-smoke/demo-dark.png`, `.cache/site-smoke/demo-light.png`, and `.cache/site-smoke/demo-mobile.png`.
Not done / risks: Local fixture smoke renders 238 options because the fixture adds one command to the 237-command production catalog; production smoke reports the expected 237 catalog commands.
```
