---
id: "0127"
title: "Demo follow-ups: prebuild/browser bundling parity, view title, empty hint, sandbox warm-up"
status: doing
milestone: M8
depends: []
---

## Goal

These are the remaining issues seen on the live demo after 0126.

## Context

1. **Prebuild bundling differs from the browser's.**
   - The 0126 prebuild fails 7 commands with "missing cross-fetch" or
     "missing entities": `humaans` ×4, `bugmenot`, `trenit` and `valkey`.
   - The orchestrator reproduced these. `installForBrowser` resolves
     `cross-fetch@4.1.0` and `entities@6.0.1`, including nested copies, and the
     public `bundleForBrowser` bundles `cross-fetch` and `cheerio` cleanly. So
     the prebuild's externalizing build path resolves packages differently.
   - Make the prebuild reuse `bundleForBrowser`'s resolution, with the shared
     registry externals added, so the two cannot diverge.
   - Add a test that prebuilds a fixture depending on a package with nested
     conflicting versions.
2. **Wrong view title.** The extension view shows "Blast" as its title under the
   breadcrumb. Show the command's navigation title, falling back to the command
   title.
3. **No empty hint.** An empty list shows nothing. Show the extension's
   `List.EmptyView`, or a neutral hint.
4. **Slow cold sandbox.** The first command open on the live site takes about
   3 s, mostly loading almostnode from the sandbox origin.
   - Warm the sandbox while the root list is idle: create the iframe and load
     `runtime.js` ahead of time, without executing extension code.
   - Measure before and after with `site:smoke:browser` against a local
     production build.

## Acceptance

- [ ] At least 230/237 commands prebuild; failures are listed with reasons.
- [ ] Unit or e2e checks for items 2 and 3.
- [ ] The cold open time measured before and after, recorded in the Handoff.
- [ ] `bun run verify`, `site:e2e` and a production `site:smoke:browser` pass.

## Safety (hard rules)

- Same as 0126:
  - headless only;
  - set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; no personal paths in
    files;
  - stub `navigator.clipboard` and `window.open`;
  - no pushes or deploys;
  - 127.0.0.1 servers only;
  - never `rm -rf` a path held in a shell variable;
  - leave any untracked `~` directory alone.

## Out of scope

- New features.

## Handoff

```
Branch/commit: t3/demo-followups-0127 @ 2dc0e46
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 88.5s
Done:
- Prebuild now builds 237/237 (was 225/237). No separate externalizing path
  existed: prebuild already called bundleForBrowser/installForBrowser, so the
  parity bugs were fixed once in the shared code.
- installForBrowser follows the lockfile's layered layout instead of pinning
  every request to the root version: humaans cross-fetch, bugmenot/trenit/
  valkey entities and splatoon node-fetch all resolve their nested copies.
- bundleForBrowser maps an import named `./x.js` to its `x.ts`/`x.tsx` source,
  as TypeScript does: multi-ai-chat and promptty bundles now resolve.
- Prebuild and on-demand bundling share `bundle-config.ts` aliases and shared
  module list, so they cannot drift again. Offline fixture test prebuilds
  `fixtures/extensions/nested-versions` with nested conflicting lock copies.
- View title uses navigationTitle, then the command title (controller
  fallbackTitle), then "Blast". Empty lists render List.EmptyView or a neutral
  "No results" hint. Unit + e2e coverage for both.
- The root list warms the sandbox at idle: iframe plus runtime.js loaded once,
  reused by the first command (no extension code executed while idle).
Cold open, local production build, site:smoke:browser ratio-calculator:
- before: 82-114 ms, 260,498 bytes (runtime.js moved during the open)
- after: 31-34 ms, 2,816 bytes (runtime.js warmed before the open)
Not done / risks:
- The live ~3 s cold open is network latency to the sandbox origin; the local
  build only shows 50-80 ms, though the launched request drops from 257 KB to
  3 KB, which is the part that dominates on the live site.
- `bun run example:browser-demo:e2e` still fails offline: it routes the catalog
  with ref "fixture" while canUseLocalFixture requires "main" (pre-existing,
  outside this task; site:e2e covers the same flow).
```
