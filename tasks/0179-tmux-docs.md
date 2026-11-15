---
id: "0179"
title: Docs, README and landing for the tmux palette
status: review
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
Branch/commit: t3/update-tmux-docs @ c166a25 (plus this handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 120.1s
Done:
- docs/tui.md: "tmux palette" section (TPM install, option names, every
  command title from the extension manifest grouped by pane/window/session/
  system); usage shows `--no-builtin` and the built-in `tmux` extension.
  Five Rendering bullets were unwrapped (same text) to stay ≤ 120 lines (115).
- README.md: "Use it in tmux" path (TPM line + prefix I); `tui` row mentions
  the palette.
- Landing "Runs everywhere" Terminal card links to BlastLauncher/tmux-blast and
  mentions the popup palette (copy and href only, layout/CSS unchanged).
- site.test.ts asserts the tmux-blast card link; `bun run site:e2e` passes.
Not done / risks:
- Docs and README say the plugin needs `@blastlauncher/tui` 3.0.0-alpha.3 or
  later, which is not on npm yet; drop that caveat once it is published.
- The landing card does not carry the version caveat; it only links to the
  plugin repo, whose README should state the requirement once released.
```
