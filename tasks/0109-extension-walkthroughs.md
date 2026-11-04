---
id: "0109"
title: Walkthroughs of popular extensions in the TUI and the macOS example
status: todo
milestone: M7
depends: ["0108"]
---

## Goal

`docs/walkthroughs/` shows a few popular Raycast extensions running in the TUI
and the macOS example, each backed by an automated check.

## Context

Pick 3–5 widely used, offline-friendly extensions from the corpus
(`compat/raycast-usage.json`, `compat/SWEEP.md`). Fetch only through
`bun run corpus:fetch --extension <name>`. Each walkthrough must be reproducible
by a script, not only described.

## Acceptance

- [ ] One page per extension: fetch, run in the TUI, run in the macOS example,
      what works and what is a known limitation.
- [ ] A script runs each walkthrough headlessly (TUI test renderer or
      `blast run --script`) and fails if the documented outcome changes; not
      part of `verify` (network), documented in the page.
- [ ] `bun run verify` passes.

## Out of scope

- Fixing extension incompatibilities found (write tasks instead).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
