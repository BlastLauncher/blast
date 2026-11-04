---
id: "0103"
title: TUI look and feel
status: doing
milestone: M6
depends: []
---

## Goal

The TUI reads like a polished Raycast client in a terminal: formatted
markdown, recognisable icons, and deliberate empty, loading and error states.

## Context

Scope agreed with the owner on 2026-11-04: polish of the reference client
(decision 0009 still holds: no new launcher features). Current gaps, from
`docs/tui.md`:

- `Detail` and `List.Item.Detail` show markdown source as plain text.
- Icons and image `content` render as text placeholders (`packages/tui/src/theme.ts`).
- Unknown node types print `[Unsupported: <type>]`.
- Empty lists, loading and command errors have minimal presentation.

Use what OpenTUI already provides before writing renderers. Prefer one small
markdown renderer over a new dependency; if a dependency is clearly better,
pin it with `npm view` and justify it in Handoff. Respect `NO_COLOR` and keep
output readable at 80 columns.

## Acceptance

- [ ] Markdown in `Detail` and `List.Item.Detail` renders headings, emphasis,
      lists, block quotes, inline code, fenced code blocks and links (link text
      plus a dimmed URL); unknown syntax degrades to its source text.
- [ ] Raycast `Icon.*` values map to readable glyphs or short labels, with a
      tested fallback; tinted colours use the theme palette.
- [ ] `List.EmptyView`/`Grid.EmptyView` render title, description and icon;
      without one, an empty list shows a quiet "No results" line.
- [ ] Loading shows a single consistent indicator; a command error shows the
      message, a hint to press Esc, and the log path or last log line.
- [ ] Unknown node types render as a dimmed, one-line notice instead of raw
      `[Unsupported: …]`, and still appear in logs.
- [ ] Tests use OpenTUI's test renderer; update `docs/tui.md`.
- [ ] `bun run verify` passes.

## Out of scope

- Launcher features (root search, favorites, hotkeys); image protocols
  (kitty/iTerm inline images); behaviour changes covered by 0104.

## Handoff

```
Branch/commit: t3/tui-look-feel @ 77a26ea
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok)
Done:
- Detail and List.Item.Detail render terminal markdown: headings, emphasis, lists, quotes, inline/fenced code, and links (text plus a dimmed URL); unsupported syntax stays visible. Parsed and frame-tested.
- client-core `icons.ts` (framework-free) maps Raycast Icon.* / ImageLike values to glyphs or short fallback labels and semantic tint roles; the TUI resolves tints through the theme palette. Row and EmptyView icons covered.
- List/Grid EmptyView shows icon, title and description; a bare empty view says "No results". One `◌ Loading…` footer indicator. Failures show the message, the last log line (or "No runtime log output.") and "Press Esc to quit".
- Unknown node/form-field types render dimmed one-line notices; the raw `[Unsupported: …]` marker stays in client-core row text and is logged once per type on stderr.
- docs/tui.md updated; new tests use OpenTUI's test renderer and bun:test.
Not done / risks:
- `scripts/corpus/tui-smoke.ts` scrapes `[Unsupported: …]` from the frame and is off-limits here; corpus TUI-smoke reports will stop classifying placeholders until that scraper reads row diagnostics or stderr. No product behaviour is lost.
- NO_COLOR is honoured by passing absent colours to OpenTUI (env read at module load), so there is no automated colour-free frame test; `bun run typecheck` covers the typed palette.
- The glyph table is curated for the common Icon.* names; rarer icons use readable short labels rather than pictograms.
```
