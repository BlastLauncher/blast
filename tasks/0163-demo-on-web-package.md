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

- [x] `bun run example:browser-demo:e2e`, `bun run site:e2e` and the browser
      unit tests pass.
- [x] Handoff reports `client.ts` line count before/after and lists anything
      still duplicated between the demo and the package, with reasons.
- [x] `bun run verify` passes.

## Out of scope

- Visual redesign, catalog/sweep changes, new demo features.

## Handoff

```
Branch/commit: t3/migrate-browser-demo-mount @ f2b5fea (round 2, on top of round 1's t3/web-demo-package-mount)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 124.4s
Done:
- client.ts runs every command through mount() with a custom render: 1,866 -> 1,368 lines. Its sandbox, runtime port, bundling, prebuilt bundle, preference store and capability wiring are gone.
- Package (all in packages/web/README.md): prebuilt.ts (verified bundles.json loading, keyed by raycast/extensions name, buildUrl stale-index check, shared runtime) and sandbox.ts (prewarm/adopt, runtime preloaded, data-blast warm|session). Round 1's bundlesUrl still fetched GitHub and ran bundles without their runtime; a hit now skips GitHub.
- Session hooks: render(view, input, { scene, status }); input() returns the ControllerResult; view(); onExit({ reason, view }); commandTitle; lazy esbuild loader; preferenceForm gets scope, its values are saved, and it answers open*Preferences.
- Session fixes: a no-view command's quit waits for its exit; a command launched from the running one tears the old sandbox down; close() leaves a custom render's DOM alone.
- prebuilt.test.ts; demo e2e, site e2e, web-embed e2e and browser unit tests (examples/browser-demo, packages/web) pass.
Not done / risks:
- Still duplicated, on purpose: (1) the demo's HTML frame and DOM/keyboard handling vs default-renderer.ts. Both share render.js, but the demo adds breadcrumb, stage, menu-bar panels, focus/scroll keeping, early typing, IME and the root launcher, and changing that is out of scope (visual redesign). (2) Platform detection: keyboard.ts vs session.ts platformName(). The root needs it before any session exists. (3) Preference form reading and validation: the package has no form UI, by design.
- Coupling: the demo maps the package's status strings ("Fetching extension…", "Installing…", …) to its stages. A `stage` field on WebStatus would remove this.
- Behaviour changes: init is sent at once (the demo's 250 ms delay is gone). A runtime error or non-zero exit after the first view returns to the root with the error; before, the dead view stayed. A first-scene timeout keeps the error on the stage. open.url opens http(s) only (package default). Esc on a preferences form opened mid-command stops the session. Prewarm also runs without a bundle index (dev server).
```
