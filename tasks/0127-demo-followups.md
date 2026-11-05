---
id: "0127"
title: "Demo follow-ups: prebuild/browser bundling parity, view title, empty hint, sandbox warm-up"
status: todo
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
