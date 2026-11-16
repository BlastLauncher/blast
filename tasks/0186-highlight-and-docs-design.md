---
id: "0186"
title: Build-time syntax highlighting; docs pages in the landing design
status: doing
milestone: M14
depends: []
---

## Goal

Every code sample on the site is syntax-highlighted at build time (landing code
tabs and docs code blocks), and the docs pages under `/docs/` share the landing
page's design.

## Context

- **Highlighter:** one build-time module, e.g. `examples/browser-demo/highlight.ts`,
  used by both `landing.ts` and `docs-site.ts`. Use `shiki` (check `npm view shiki
  version`; pin exactly as a devDependency of `examples/browser-demo`; justify in
  Handoff). Load only the grammars the site needs: ts/js, html, go, python, swift,
  json, sh/bash, plus `text`. No client-side highlighting and no runtime CDN:
  the output is static HTML with inline colour classes or CSS variables.
  - Dual theme: light and dark token colours switched by `prefers-color-scheme`
    (shiki's dual-theme CSS-variable output). Code blocks themselves keep the
    landing's dark code surface in both page themes; pick one dark theme whose
    colours reach WCAG AA (4.5:1) on that surface, and use it for both if dual themes
    add nothing. Decide and say which in Handoff.
  - `landing()` and `renderChapter()` are synchronous and their tests call them
    directly. Keep them synchronous: use shiki's sync API with the JavaScript regex
    engine, or create the highlighter once at module load. Do not make the tests async
    for no reason.
- **Landing:** highlight the JS, Web page (html), Go, Python, Swift snippets. The
  NDJSON tab keeps its `→` sent / `←` received colouring, with JSON highlighting inside
  each line if it stays readable. Snippet text stays verbatim: `expectLandingSnippets`
  must keep passing; if markup now splits a checked string across spans, assert on the
  text content (strip tags) instead and say so in Handoff.
- **Docs pages** (`docs-site.ts`, `docsCss`): adopt the landing's design system —
  same header (Blast mark, Docs / Demo / Coverage / GitHub nav), Geist and Geist Mono
  from `/fonts/` (already shipped by `buildSite`), the landing's colour tokens and
  light/dark palette, and its code block look. Keep the docs structure from 0180:
  left sidebar of chapters with `aria-current`, the article (~70ch), "On this page"
  list, heading anchors, "Edit on GitHub". Code blocks get a small language label and a
  Copy button (tiny inline script; the page must stay fully readable with JS off).
  Tables, `<kbd>`, inline code and blockquotes styled to match. Docs index (`/docs/`)
  lists the chapters as a clean list with their descriptions.
- Look at the live landing (`https://blast.yukai.dev/`) or `bun run site:build` output for
  the design; reuse its tokens rather than inventing a new palette. If shared CSS between
  the landing and docs makes sense, put it in one place the build writes once.
- Do not change docs content (`docs/*.md`), the demo, or the TUI player.

## Acceptance

- [ ] Test: landing JS/Go/Python/Swift/html panels contain highlighted token spans; the
      stripped text of each panel equals the original snippet.
- [ ] Test: a docs fixture with `ts, `sh and an unlabeled fence renders highlighted
      spans for the first two and escaped plain text for the third; `<script>` in code
      stays escaped.
- [ ] Test: docs pages link `/fonts/` Geist, carry the landing header nav, and every page
      still has one `aria-current="page"` and resolvable same-site links (existing tests
      keep passing).
- [ ] `bun run site:build && bun run site:e2e -- --screenshots <dir>` passes. Screenshots:
      landing code section and `/docs/embedding/` at 1280px and 360px, light and dark. Look
      at them and list the paths in Handoff.
- [ ] No request outside the site's origin from the landing or docs pages (e2e already
      checks docs; keep it).
- [ ] `bun run verify` passes.

## Out of scope

- Docs content, search, versioning; the demo and TUI player; client-side highlighting.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
