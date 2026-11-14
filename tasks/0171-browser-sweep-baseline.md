---
id: "0171"
title: "Browser sweep: fresh baseline, placeholder preferences, browser limits apart"
status: doing
milestone: M10
depends: []
---

## Goal

`compat/BROWSER-SWEEP.md` reports today's demo (on `@blastlauncher/web`)
honestly: commands that need preferences are tried with placeholder values,
and commands that cannot work in any browser tab are counted apart from
Blast failures, so the headline is "rendered / renderable in a browser".

## Context

- Sweep: `examples/browser-demo/browser-sweep.ts` (`bun run
  site:sweep:browser`), classifier `classifyBrowserOutcome`, catalog
  `examples/browser-demo/catalog.json` (`scripts/browser-catalog.ts`).
  The last run (2026-11-09) predates 0163 (demo on `mount()`): 104/237
  rendered; 51 `needs-preferences`; 49 "<App> is not installed" (Rectangle,
  MenuCloak, Superwhisper); 10 selection/no-text/applications; 4 network.
- Placeholder preferences: the Node corpus smoke already fills required
  preferences with placeholder values (task 0086, `scripts/corpus/`); use the
  same values through the package's `preferenceForm` hook or preference
  store, never by editing extensions. A command that renders with
  placeholders counts as `rendered-with-placeholders` (still "rendered").
- Browser limits: a new outcome group `browser-limit` for errors that come
  from Blast's own browser denials (selection, applications, missing native
  app deep links/AppleScript, CORS/network). Match on the capability that was
  denied (capability request log), not on extension-specific message text,
  where possible; list any text matching with a reason.
- Commands whose extension requires a native macOS app (all of Rectangle's 41) should leave the browser catalog: add a catalog filter (e.g.
  `browser-limit` in the last sweep → excluded from `catalog.json` with the
  reason in the sweep report). Keep the filter generic, not a name list.
- Network is allowed here (sweep fetches from GitHub/npm into `.cache/`).
  Export `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`.

## Acceptance

- [ ] Fresh `compat/browser-sweep.json` and `BROWSER-SWEEP.md` from today's
      demo, with a headline `rendered / (total − browser-limit)` and a table
      of remaining Blast failures by error.
- [ ] Unit tests for the new classifier outcomes and the catalog filter.
- [ ] `bun run site:e2e` and `bun run verify` pass.

## Out of scope

- Fixing runtime errors (0172), changing what the demo does at runtime.

## Handoff

```
Branch/commit: t3/browser-sweep-baseline @ bd4aa89
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 190.5s
Done: Added browser-limit and rendered-with-placeholders classification, generic native dependency catalog filtering, deterministic browser preference placeholders, and fresh compat/browser-sweep.json plus BROWSER-SWEEP.md.
Not done / risks: Rectangle/MenuCloak/Superwhisper remain in the generated catalog because their native-app requirement is surfaced by runtime errors rather than dependency metadata; runtime fixes are task 0172.
```
