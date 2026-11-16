---
id: "0182"
title: Landing craft pass — real book typography, fewer boxes, a hero that tells the flow
status: doing
milestone: M12
depends: ["0181"]
---

## Goal

The landing page (`examples/browser-demo/landing.ts`) stops reading as a
generated template. It reads like a carefully set technical manual, and its
hero animation shows the actual flow: one input, one view from the engine,
drawn natively by four different hosts.

## Context

User feedback on 0181: "still feels like vibe coding, AI touches; maybe the
typography or some touches; the hero diagram needs animation". Diagnosis:

1. Templated rhythm: every section is eyebrow label (`§ 1 · …`, `FOLIO I · …`)
   - h2 + filler subtitle + "Margin note" aside + grid of bordered cards.
2. Boxes everywhere: card grids with "Explore … →", big-number stat tiles,
   ✓/→ two-column cards with bold-lead bullets, "B"-in-a-square logo plus a "REFERENCE" tag.
3. Type falls back to Georgia/DejaVu on most machines; small caps and figures are faked
   with uppercase + letter-spacing; terracotta accent sprayed on every label.
4. Hero motion is decoration (marching dashes, pulse, row flicker), and all four
   hosts draw the identical red list, which hides the point.

Direction (keep the paper/ink palette and dark "reading room" mode):

- **Type.** Self-host two OFL fonts, Latin subset woff2 only: Newsreader
  variable (`@fontsource-variable/newsreader@5.3.0`, opsz + wght, roman and italic)
  and IBM Plex Mono (`@fontsource/ibm-plex-mono@5.3.0`, 400/500). Get the files with
  `npm pack` into `.cache/` (no dependency added), commit only the needed woff2 files
  and `OFL.txt` under `examples/browser-demo/fonts/`; `buildSite` copies them to
  `www/fonts/`. Use `@font-face` with `font-display: swap`, preload the roman. Use
  real typographic features: `font-variant-caps: all-small-caps` (or `small-caps`),
  `font-variant-numeric: oldstyle-nums` in prose and `lining-nums tabular-nums` in
  tables, optical sizes for display vs text, proper hanging punctuation where it
  works. Body in the serif too; sans only if something truly needs it.
- **Layout like a manual, not a SaaS page.** One strong text column (~62–68ch)
  with a real margin column used _sparingly_ (at most two marginal notes on the
  page, and only ones that add information). Drop most eyebrow labels; if
  sections are numbered, number them plainly in the heading. Replace card grids with
  typographic structures: "Runs everywhere" as a ruled table or definition list
  (host · transport · one line · link); "What Blast does / what you do" as a
  two-column ruled table; receipts as a ruled ledger row with tabular figures and a
  footnote-style source line; install as plain code lines. No drop shadows,
  no rounded cards, no hover lifts. Buttons become restrained (text link with rule, or
  one solid button maximum). Logo: the word "Blast" set in the display face, no box,
  no tag. Accent colour used for links and the hero only.
- **Copy.** You may delete sentences, section intros and asides, and shorten text.
  You may NOT add new claims, features, numbers or APIs. Generic lines like "A clean
  boundary between extension execution and your host application." and
  "Integrate Raycast extensions into any architecture, runtime environment, or
  platform." should go. Everything `expectLandingSnippets` in
  `site.test.ts` checks stays verbatim (title, h1, hero paragraph, snippets, tabs,
  install commands, version, stats, tmux link/text); update a test only where a
  structural assertion (e.g. `class="card"` on the tmux link) must change, and say so in Handoff.
- **Hero animation, CSS only (no JS), one loop of ~8–10 s:**
  1. In the macOS host, a caret types `ap` into the search field (steps()).
  2. A small labelled packet `root.input` travels from that host to the engine.
  3. The engine reacts visibly (e.g. an ink-stamp or tick, not a glowing pulse) and
     emits `root.view`.
  4. Packets fan out (staggered) to all four hosts along the wires.
  5. Each host redraws the same filtered result in its _own idiom_: macOS: rounded
     native-looking list with selection; Terminal / tmux: monospace rows with a `›`
     marker and box-drawing frame; Web page: a plain DOM list; Go / Python: the
     raw NDJSON line typing out, e.g.
     `{"event":"root.view","view":{"kind":"list","rows":[…]}}`.
     Rows that do not match `ap` collapse; the match becomes selected.
  6. Hold, then reset softly.
     Keep the four labels and sublabels the 0181 test checks. Under
     `prefers-reduced-motion: reduce`, show step 5's final state statically. At ≤ 700px a
     simplified vertical version is fine but must still animate the same story.
- Docs pages (`docs-site.ts`) stay as they are. Do not touch `demo.css`/`client.ts`.

## Acceptance

- [x] `bun run site:build` writes `www/fonts/*.woff2` and `OFL.txt`; total font
      bytes ≤ 320 KB (308,468 bytes across 4 `.woff2` files; cap raised from 220 KB
      to 320 KB per orchestrator decision to keep Newsreader `opsz+wght` roman and
      italic); the page makes no request outside its own origin (no-external-URL
      test in `site.test.ts` updated to allow same-origin `/fonts/*.woff2` `url()`
      only and assert roman-only preload).
- [x] The page contains no element with a border-radius > 4px outside the hero,
      no `box-shadow`, and at most two margin notes (tested in `site.test.ts` and
      `site-e2e.ts`).
- [x] Hero frames: `site-e2e.ts --screenshots` sets `document.getAnimations()`
      `currentTime` to 6 points across the loop and screenshots the hero at 1280px
      light and dark, plus reduced-motion and 360px hero frames; PNG paths listed
      in Handoff.
- [x] Full-page screenshots, light and dark, at 1280px and 360px, paths in Handoff.
- [x] `bun run site:e2e` passes (360px overflow check included).
- [x] `bun run verify` passes.

## Out of scope

- New copy, claims or sections; JavaScript on the landing page; the docs pages.

## Handoff

```
Branch/commit: t3/finish-landing-hero-animation @ ea38caa (code) + handoff commit
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 121.0s (1161 pass, 2 skip, 0 fail); site:e2e PASS (chromium)
Done:
- Self-hosted Newsreader opsz+wght (roman + italic) and IBM Plex Mono (400/500) Latin woff2 + OFL.txt under examples/browser-demo/fonts/, copied to www/fonts/ by buildSite(). Kept both Newsreader opsz+wght files (~301 KiB / 308,468 bytes total across 4 woff2 files) per orchestrator decision, raised font-size cap to 320 KB, and preloaded only newsreader-latin-opsz-normal.woff2.
- Redesigned landing.ts as a single-column technical manual with at most two margin notes, ruled tables/ledger rows, book typography (all-small-caps, oldstyle-nums in prose, tabular lining-nums in tables), no box-shadow, no border-radius > 4px outside .hero, and reduced copy without inventing claims/APIs/numbers.
- Finished CSS-only 9s hero animation (typing `ap`, `root.input` packet to Blast Engine, terracotta ink-stamp reaction, staggered `root.view` fan-out, and host-idiom redraws across macOS/TUI/Web/NDJSON + mobile vertical rail), fixed loop layout shift, NDJSON `code` font-size clipping, caret/placeholder overlap, mobile rail alignment, and reduced-motion NDJSON specificity.
- Updated site.test.ts (removed obsolete `class="card"` check on tmux link, updated `url()` check for `/fonts/*.woff2`, added single roman preload + 4 woff2 <= 320 KB assertions) and site-e2e.ts/ambient.d.ts (craft assertions + hero frame/reduced-motion/360px screenshot capture).
- Generated screenshots via `bun run site:e2e -- --screenshots .cache/site-screenshots`:
  - Hero 1280px light/dark: .cache/site-screenshots/hero-01-type-{light,dark}.png, hero-02-input-{light,dark}.png, hero-03-engine-{light,dark}.png, hero-04-fanout-{light,dark}.png, hero-05-redraw-{light,dark}.png, hero-06-hold-{light,dark}.png
  - Hero reduced-motion & 360px: .cache/site-screenshots/hero-reduced-motion.png, hero-360-packet.png, hero-360-hold.png
  - Full-page 1280px & 360px: .cache/site-screenshots/desktop-{light,dark}.png, mobile-360-{light,dark}.png, docs-360.png
Not done / risks:
- No multimodal image viewer is available in this headless CLI environment, so PNGs were verified via Playwright DOM/bounding-box/computed-style/font-load checks across all 6 animation timestamps, reduced-motion, light/dark modes, and 1280px/360px viewports rather than visual pixel inspection; human/reviewer visual spot-check of the PNGs in .cache/site-screenshots/ is recommended.
- Two sandbox tests in scripts/corpus/sandbox.test.ts were skipped (pre-existing environment skips).
```
