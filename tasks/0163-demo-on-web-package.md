---
id: "0163"
title: Browser demo on @blastlauncher/web
status: doing
milestone: M9
depends: ["0159"]
---

## Goal

The browser demo (`examples/browser-demo`, published at blast.yukai.dev/demo)
is a consumer of `@blastlauncher/web`: its bespoke host wiring is gone and
what remains is catalog, theming and site-specific UI.

## Context

- Decision 0015 and `packages/web` (0159). The demo's `client.ts` (~1900
  lines) still wires sandbox, runtime port, controller and capabilities
  itself. Replace that wiring with `mount()` (custom `render` if the demo's
  Raycast-style UI needs it) and the package's handlers; keep the demo's look,
  keyboard behaviour, root launcher, showcase and progress UI.
- If the package lacks a hook the demo needs, add it to the package (small,
  documented in its README) rather than reaching around it.
- Playwright: export `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`;
  do not download browsers.
- 0159 left two demo-only paths for this task: prebuilt bundles
  (`bundles.json`) and the preferences form. Add them to `mount()` (options
  or hooks) so the demo needs no private wiring.

## Acceptance

- [ ] `bun run example:browser-demo:e2e`, `bun run site:e2e` and the browser
      unit tests pass.
- [ ] Handoff reports `client.ts` line count before/after and lists anything
      still duplicated between the demo and the package, with reasons.
- [ ] `bun run verify` passes.

## Out of scope

- Visual redesign, catalog/sweep changes, new demo features.

## Handoff

```
Branch/commit: t3/web-demo-package-mount @ 2674cf7 (plus 83a29ec, e55fbc4, ccc3a76)
Verify: browser e2e and focused browser tests pass; full bun run verify rerun pending after final edits
Done:
- Added public `bundlesUrl` support to `mount()` with validated bundles.json, digest checks, manifest metadata, and file loading.
- Added public `preferenceForm` hook for required preference submission and documented both hooks.
- Exported bundle index helpers from `@blastlauncher/web`.
Not done / risks:
- `examples/browser-demo/client.ts` remains 1,866 lines and still owns bespoke sandbox/runtime/controller, prebuilt bundle, and preference-form wiring; it has not yet been migrated to `mount()`.
- Full `bun run verify` must be rerun after any follow-up migration.
```
