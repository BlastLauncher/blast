---
id: "0180"
title: Render the user-facing docs on the site
status: doing
milestone: M12
depends: []
---

## Goal

`bun run site:build` writes the user-facing docs as plain, readable HTML pages
under `/docs/`, generated from `docs/*.md` on every build so they cannot drift.

## Context

- Site build: `buildSite` in `examples/browser-demo/site.ts` writes `www/`
  (landing `index.html`, `site.css`, `404.html`, `demo/`). Add the docs there;
  put the new code in its own module, e.g. `examples/browser-demo/docs-site.ts`,
  with tests in `examples/browser-demo/docs-site.test.ts`. Task 0181 rewrites
  `landing.ts` and `site.test.ts` in parallel, so do not edit those two files.
- Pages and URL scheme (0181 links to these exact URLs, keep them):
  `/docs/` is an index listing the chapters in this order, then
  `/docs/quickstart/`, `/docs/embedding/`, `/docs/root-view/`,
  `/docs/launch-prompts/`, `/docs/capabilities/`, `/docs/cli/`, `/docs/tui/`,
  `/docs/architecture/`, each from `docs/<slug>.md`. Page titles come from each
  file's first `#` heading. Decisions, release notes and walkthroughs are not rendered.
- Links: a link to one of those eight files (`quickstart.md`, `./embedding.md`,
  `embedding.md#anchor`) becomes the site page URL. Any other repo-relative link
  (`../examples/go-embedder/`, `../packages/web/README.md`, `./release.md`)
  becomes `https://github.com/blastlauncher/blast/blob/main/<path>` (or `tree/`
  for directories). Absolute URLs are unchanged. Fail the build on a relative link whose
  target does not exist in the repo.
- Layout is a plain docs default, not the landing design: a header with a
  "Blast" home link plus Docs / Demo / GitHub links, a left sidebar with the
  chapters (current page marked with `aria-current="page"`), the article, and an
  "On this page" list of `##` headings. Headings get stable `id`s (GitHub slug
  rules) with anchor links. One shared `docs.css`, system font stacks, light and
  dark via `prefers-color-scheme`, readable at 360px (sidebar collapses above
  the article), no JavaScript needed, no external requests (no font or CDN).
- Markdown in these files: headings, paragraphs, lists (incl. nested), fenced
  code with language, inline code, tables, links, emphasis, inline `<kbd>`.
  Using a markdown library is fine: check `npm view marked version`, pin that exact
  version in `examples/browser-demo/package.json`, and justify it in Handoff.
  Escape code blocks; pass through only the inline HTML the docs actually use.
- Each page links "Edit on GitHub" to its source file.
- `site.yml` deploy smoke greps the landing `<title>`; leave it alone.

## Acceptance

- [ ] `bun run site:build` (default local origins) writes `www/docs/index.html` and
      `www/docs/<slug>/index.html` for all eight slugs and `www/docs/docs.css`.
- [ ] `docs-site.test.ts`: every page has its title as `<h1>`, the sidebar
      lists all eight chapters with exactly one `aria-current="page"`, and no
      rendered `href` ends in `.md` except GitHub `blob/main` URLs.
- [ ] Test: every same-site `href` (and `#anchor`) on every docs page resolves to a
      written page and an existing heading id.
- [ ] Test: a relative link to a missing file fails the build with the file name in the error.
- [ ] Fenced code is HTML-escaped (test with a `<script>` string in a fixture).
- [ ] `bun run site:e2e` still passes; add one check that `/docs/quickstart/`
      loads and does not overflow horizontally at 360px.
- [ ] `bun run verify` passes.

## Out of scope

- Editing `landing.ts`, `site.test.ts`, or the content of `docs/*.md` (apart from
  fixing a link that is actually broken).
- Search, versioning, client-side JavaScript, syntax highlighting.

## Handoff

```
Branch/commit: t3/docs-on-site @ e8a4fb7 (code; this Handoff is the next commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 140.4s
Done:
- examples/browser-demo/docs-site.ts renders docs/<slug>.md for the eight
  chapters into www/docs/<slug>/index.html, plus docs/index.html and
  docs/docs.css; buildSite calls writeDocs (one line in site.ts).
- Links: chapter .md links become /docs/<slug>/[#anchor]; other repo paths go
  to GitHub blob/ or tree/ main; absolute URLs unchanged; a missing target or
  a path outside the repo fails the build, naming the source file and link.
- Layout: header (Blast, Docs, Demo, GitHub), sidebar (Overview + 8 chapters,
  one aria-current), article, "On this page" (## headings), Edit on GitHub.
  GitHub-style heading ids with # anchors. No JS, system fonts, light and dark,
  stacks at <=48rem. Fenced code escaped; only <kbd> passes through as raw HTML.
- docs-site.test.ts (14 tests): files written, h1 titles, sidebar order and
  aria-current, no .md hrefs except blob/main, every same-site href and anchor
  resolves, missing-link error, <script> fixture escaped, tables/lists, slugs.
- site-e2e.ts: /docs/quickstart/ at 360px has its h1, its sidebar entry is
  current, it does not overflow, and it loads docs.css with no other-origin requests.
Not done / risks:
- New dependency marked@18.2.0 (exact, latest by `npm view marked version`):
  maintained GFM parser with no dependencies, covering tables, nested lists and
  fenced code, so the renderer does not need its own markdown parser. marked@17.0.1
  was already in bun.lock through @opentui/core.
- tui.md has two raw `<command>` placeholders outside code; GitHub hides them,
  the site escapes them so they read as text. The docs are unchanged.
- The index blurbs are short hand-written summaries in docChapters; titles come
  from the files.
- site-e2e.ts was edited (a separate block after the landing 360px check); 0181
  may touch the same file, so a merge conflict is possible but small.
```
