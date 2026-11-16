---
id: "0183"
title: Landing v3 — centered product hero with the live demo, technical section below
status: doing
milestone: M13
depends: []
---

## Goal

`examples/browser-demo/landing.ts` matches the approved mock-up: a centered
product hero whose main visual is the live browser demo (with a Browser /
Terminal switch), and the technical material in one section below.

## Context

- **Approved mock-up (the spec):** `/home/ubuntu/.cache/blast-design/landing-mock.html`
  (open it in Playwright or read the source). Match its structure, copy, spacing
  and tokens. It replaces the 0181/0182 serif "manual" look completely.
- **Type:** self-host Geist and Geist Mono, latin woff2 only, from
  `@fontsource-variable/geist@5.3.0` and `@fontsource-variable/geist-mono@5.3.0`
  (`npm pack` into `.cache/`, no dependency added), into `examples/browser-demo/fonts/`
  with `OFL.txt`. Delete the Newsreader and IBM Plex files. Keep the same-origin
  `url(/fonts/…)` rule and adjust the font-size cap test to the new files (expect well under 200 KB).
- **Hero:** version pill, h1, hero paragraph, Quickstart (`/docs/quickstart/`) and
  "Try it in the browser" (`/demo/`) buttons, the tmux plugin line with a Copy
  button, then a `Browser | Terminal` switch (ARIA tabs, keyboard operable).
  - **Browser** (default): a browser-window frame with an iframe of the site's own
    `${origin}/demo/?embed=1`. Add an embed mode to the demo: `demoPage` in
    `template.ts` / the client read `embed=1` from `location.search` and leave out
    the demo bar (`.demo-bar`), nothing else changes. The frame header shows the
    demo URL and an "Open full screen ↗" link to `/demo/`.
  - **Terminal**: an empty `<div id="tui-player" data-cast="/tui.cast">` inside the same
    frame size, plus a caption. Task 0184 (in parallel) ships `www/tui-player.js`
    exporting `mountTuiPlayer(element: HTMLElement, castUrl: string): { dispose(): void }`
    and `www/tui.cast`. On first selection of Terminal, `import("/tui-player.js")` and
    mount; on switching back, dispose. If the import fails, show a plain
    "Recording unavailable" message in the frame. Do not script your own terminal animation.
- **Technical section** (exactly as in the mock): "How it works / One engine. Your client
  draws the views." with the Extension → Engine → Client strip; "Any language, one
  protocol." with the three stats from `SiteStats`, the three install lines, and code tabs
  NDJSON, JavaScript, Web page, Go, Python, Swift (keep the Swift snippet too).
- **Keep verbatim:** `<title>`, h1, hero paragraph, every snippet string at the top of
  `landing()`, install commands and version, stats. `expectLandingSnippets` in
  `site.test.ts` is the contract; update only structural assertions (tab labels move to
  buttons, tmux link may become the pill/plugin line) and list each change in Handoff.
  The JS on the page is allowed now (tabs, switch, copy, lazy player import); keep it
  inline and small, and the page must be fully readable with JS off (Browser view shown).
- Light and dark via `prefers-color-scheme`; no horizontal overflow at 360px; visible focus.
- Do not touch `docs-site.ts` or anything 0184 owns (`tui-player.ts`, the recording script, `*.cast`).

## Acceptance

- [ ] `site.test.ts` passes with the updated contract; a test checks the switch markup,
      the iframe `src` ends with `/demo/?embed=1`, and the lazy `/tui-player.js` import.
- [ ] Test: `demoPage` with embed leaves out `.demo-bar`; without it the bar is still there.
- [ ] `bun run site:build && bun run site:e2e` passes; e2e checks the hero iframe loads
      the demo root (the launcher search field appears inside the frame) at 1280px.
- [ ] Screenshots light/dark at 1280px and 360px; compare them against the mock-up
      yourself and list the paths in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- The terminal recording and player (0184), docs pages, demo behaviour beyond embed mode.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
