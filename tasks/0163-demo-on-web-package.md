---
id: "0163"
title: Browser demo on @blastlauncher/web
status: todo
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
- Playwright browsers: set `PLAYWRIGHT_BROWSERS_PATH` to the existing
  install (see `examples/browser-demo/README.md`); do not download a second copy.

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
Branch/commit:
Verify:
Done:
Not done / risks:
```
