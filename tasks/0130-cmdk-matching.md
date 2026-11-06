---
id: "0130"
title: Rank the demo root list with cmdk's matcher
status: doing
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
Branch/commit: t3/cmdk-matching-ranking @ 57b173f722de46766576cc46241b3a6710e6032f
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 94.5s
Done:
- root.ts ranks the root list with cmdk's defaultFilter over the command title plus extension title/name and command name/description; score 0 is hidden, ties sort by title then id, and an empty query keeps the curated suggestions order.
- root.test.ts covers the real catalog: ratio and cal rat -> Calculate Ratio, rect -> Rectangle's commands first, the acronym tl -> Top Left, empty query keeps suggestions, and a no-match query returns [].
- examples/browser-demo is now a workspace package pinning cmdk@1.1.1 (plus react@19.3.1/react-dom@19.3.1, the peers cmdk requires to import); root workspaces and bun.lock were regenerated with bun install.
- Added client.js bytes: 313,148 -> 497,473 (+184,325, unminified). cmdk's index.mjs imports React and Radix at module scope, so Bun keeps the whole module graph. That is far above the 15 KB threshold; no alternative was chosen without orchestrator direction.
- bun run site:e2e passed (headless, 127.0.0.1).
Not done / risks:
- The client bundle size needs an orchestrator decision: keep cmdk's public import (+184 KB) or approve a build-time shim over cmdk's command-score that preserves the same matcher.
- esbuild-wasm, almostnode and Playwright remain on the .cache bootstrap; only cmdk (and its React peers) moved into the demo workspace.
```
