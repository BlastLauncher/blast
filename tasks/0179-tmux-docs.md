---
id: "0179"
title: Docs, README and landing for the tmux palette
status: doing
milestone: M11
depends: ["0176", "0178"]
---

## Goal

A tmux user finds the palette from the README or landing page and installs
it in two lines.

## Context

- `docs/tui.md` gets a "tmux palette" section (keep ≤ 120 lines; link to the
  plugin README); `README.md` a short "Use it in tmux" path; the landing
  "Runs everywhere" Terminal card links to `BlastLauncher/tmux-blast` and
  mentions the palette (`examples/browser-demo/landing.ts`, update
  `site.test.ts`). Claims must match code: list only commands that exist in
  `packages/tui/extensions/tmux/package.json`.
- Note that the plugin needs a TUI version on npm that includes popup mode.

## Acceptance

- [ ] `site.test.ts` asserts the tmux link; `bun run site:e2e` passes.
- [ ] `bun run verify` passes.

## Out of scope

- Code changes beyond the landing page.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
