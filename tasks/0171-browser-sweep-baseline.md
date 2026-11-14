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
Branch/commit: t3/browser-sweep-baseline-fixes @ df482da (round 2, on t3/browser-sweep-baseline)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 125.6s
Done:
- browser-limit comes from a capability log: the sweep wraps MessagePort in an
  init script and records each request and answer (applications.*, denied
  selection/window/ai/oauth, open.path, non-web open.url); CORS/connection
  failures stay "network". No extension text is matched.
- needs-credentials (placeholder preferences + remote HTTP 401/403/404) and
  rendered-with-placeholders (read after the form was answered) are reported
  apart; placeholders come from scripts/corpus launchInputs via addInitScript,
  and the demo no longer reads a URL parameter.
- scripts/browser-catalog.ts drops browser-limit commands (persisted through
  browser-sweep.json "excluded"), and the report lists them under "Excluded
  from the demo". Its main now runs only as a script, so the test does no fetch.
- Headline: Rendered 134 / 170 (104 rendered + 30 with placeholders) of 237 −
  67 browser-limit. Per outcome: rendered 104, rendered-with-placeholders 30,
  completed 4, empty 1, browser-limit 67 (applications.list 53, selection.text
  8, network 5, applications.frontmost 1), needs-credentials 16, Blast
  failures 15 (14 runtime-error, 1 missing-arguments). Catalog 237 → 170.
Not done / risks:
- 1, 3, 4 and 5 share the classifier and runner, so they landed in one commit.
- browser-limit takes the first limited capability: quick-jump/search is
  listed as applications.list, but it fails on its placeholder file path.
- Live services move a few commands between runs (humaans 401 vs unsafe
  header; v0 manage-profiles rendered vs 401).
- No-view commands now wait up to 5 s for their exit; undecorate-text read
  as empty before. site:e2e reads the command count from catalog.json.
```
