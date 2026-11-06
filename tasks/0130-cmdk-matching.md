---
id: "0130"
title: Rank the demo root list with cmdk's matcher
status: todo
milestone: M8
depends: []
---

## Goal

The demo's root list filters and orders commands with cmdk's matcher. cmdk is
the command-palette library behind many Raycast-style UIs. Typed queries
should then behave as people expect from such palettes: fuzzy, word-start
boosts, keywords.

## Context

- **Today:** `examples/browser-demo/root.ts` ranks with client-core's
  `score`/`rankGroups`.
- **Use cmdk's exported `defaultFilter(value, search, keywords?)`** from the
  `cmdk` package:
  - Check the latest version with `npm view cmdk version`, pin it exactly,
    and justify it in the Handoff.
  - Add it to the `examples/browser-demo` path only, the same way the demo's
    other pinned dependencies are installed. Keep it out of product packages.
  - Measure how many bytes it adds to the host page's `client.js`. If
    importing it drags React into the host bundle and adds more than 15 KB
    min, tell the orchestrator in the Handoff before choosing an alternative.
    Do not silently swap in another library.
- **Match against:** the command title, the extension title, and keywords made
  from the command and extension names and the description.
  - Hide items with a score of 0.
  - Sort by score descending, then title.
  - An empty query keeps the current suggestions order.
- **Keep:** the URL row, selection clamping and the action panel.

## Acceptance

- [ ] Unit tests with cmdk's scoring on real catalog titles:
  - [ ] `ratio` → Calculate Ratio first;
  - [ ] `cal rat` → Calculate Ratio;
  - [ ] `rect` → Rectangle's commands;
  - [ ] a typo-free acronym case;
  - [ ] an empty query keeps suggestions;
  - [ ] a no-match query gives an empty list.
- [ ] `bun run site:e2e` passes.
- [ ] The Handoff records the added bytes.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; never write absolute
  personal paths into files; never download Chromium.
- Stub `navigator.clipboard` and `window.open` in tests and sweeps.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build, sweep and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep `.cache` growth under about 150 MB.
- Gate commits on exit codes, not piped output.

## Out of scope

- Rewriting the UI in React.
- Capabilities (0128).
- The sweep (0129).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
