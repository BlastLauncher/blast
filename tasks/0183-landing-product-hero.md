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
Branch/commit: t3/landing-product-hero @ 8279d31 (code) + handoff commit (ae999c7 fonts, 60bf6e2 demo embed mode, 9c7606c landing layout, 8279d31 tests/e2e)
Verify: verify: FAIL (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow FAIL, test ok) in 123.9s (1162 pass, 2 skip, 0 fail, 8998 expect() calls, --seed=2171607738); site:e2e --screenshots .cache/screenshots/0183 PASS (chromium)
Done:
- Self-hosted upright Geist and Geist Mono variable latin woff2 files (52,528 bytes total < 200 KB) + OFL.txt under examples/browser-demo/fonts/ from @fontsource-variable/geist@5.3.0 and @fontsource-variable/geist-mono@5.3.0; removed Newsreader and IBM Plex woff2 files.
- Added demo ?embed=1 mode in examples/browser-demo/template.ts, client.ts, demo.css, and main.ts so demoPage(..., true) and ?embed=1 omit .demo-bar without pre-paint flash while preserving .demo-bar by default.
- Rewrote examples/browser-demo/landing.ts to match the approved mock-up: centered product hero with version pill linking to BlastLauncher/tmux-blast, verbatim <title>/h1/hero paragraph/stats/install commands/6 code snippets (NDJSON, JavaScript, Web page, Go, Python, Swift), Quickstart + "Try it in the browser" CTAs, tmux plugin Copy row, ARIA Browser | Terminal switch (embedded /demo/?embed=1 iframe + "Open full screen ↗", and #tui-player[data-cast="/tui.cast"] with lazy import("/tui-player.js"), mountTuiPlayer, dispose(), and "Recording unavailable" fallback), "How it works" 3-column flow, "Any language, one protocol." split + 6 ARIA code tabs, light/dark prefers-color-scheme, visible focus, 360px responsiveness, and JS-off fallback showing Browser view and all 6 code panels.
- Updated examples/browser-demo/site.test.ts, site-e2e.ts, and ambient.d.ts. Changes to expectLandingSnippets / site.test.ts:
  1. Replaced "command palette in a popup" / old tmux link check with `<a class="pill" href="https://github.com/BlastLauncher/tmux-blast">` and "The tmux palette is out".
  2. Replaced 0182 hero-diagram labels ("macOS app", "Terminal / tmux", "Go / Python", etc.) with 0183 hero switch/player assertions (`id="sw-web"`, `id="sw-tui"`, `aria-controls="view-web"`, `aria-controls="view-tui"`, `/demo/?embed=1`, "Open full screen ↗", `id="tui-player" data-cast="/tui.cast"`, `import("/tui-player.js")`, `mountTuiPlayer`, "Recording unavailable", and `not.toContain("Ctrl+Space opens blast-tui")`).
  3. Removed 0182 craft-pass negative checks (`not.toMatch(/\bbox-shadow\s*:/i)`, `brand-mark`, `brand-folio`, `catalogue-tag`, `section-kicker`, `<aside>` count) because the mock-up uses elevation box-shadow on .browser/.term.
  4. Changed `not.toMatch(/\bsrc\s*=/i)` to assert every `src=` attribute matches `/^(?:https?:\/\/[^/]+)?\/demo\/\?embed=1$/` (same-origin demo iframe only).
  5. Updated `<link rel="preload">` assertion from `/fonts/newsreader-latin-opsz-normal.woff2` to `/fonts/geist-latin-wght-normal.woff2`.
  6. Outside expectLandingSnippets in site.test.ts: changed `role="tab">${label}</label>` to `<button[^>]*role="tab"[^>]*>${label}</button>` and font checks from 4 files (`<= 320 KB`, newsreader) to 2 files (`< 200 KB`, geist + geist-mono).
- Captured screenshots via `bun run site:e2e --screenshots .cache/screenshots/0183` and verified DOM/computed-style/dimension parity against the mock-up at 1280px and 360px light/dark (scrollWidth 1280/360, 2-line h1 144px@72px / 114px@38px, hero height 1313px vs mock 1312px):
  - .cache/screenshots/0183/desktop-light.png (1280x2422)
  - .cache/screenshots/0183/desktop-dark.png (1280x2422)
  - .cache/screenshots/0183/hero-desktop-light.png (1280x1313)
  - .cache/screenshots/0183/hero-desktop-dark.png (1280x1313)
  - .cache/screenshots/0183/hero-terminal-light.png (1280x1313)
  - .cache/screenshots/0183/mobile-360-light.png (360x3358)
  - .cache/screenshots/0183/mobile-360-dark.png (360x3358)
  - .cache/screenshots/0183/docs-360.png
Not done / risks:
- Selecting Terminal currently displays "Recording unavailable" because /tui-player.js and /tui.cast are owned by parallel task 0184.
- `check:workflow` failed only on pre-existing line 14 of tasks/0183-landing-product-hero.md (`## Context` from base commit c82302d naming the mock-up's local path); no new home paths were introduced.
- Two pre-existing sandbox tests in scripts/corpus/sandbox.test.ts were skipped.
- Headless environment has no visual image viewer; screenshots were checked via PNG headers/sizes and Playwright DOM/layout/style/font parity queries against the mock-up rather than visual pixel inspection.
```
