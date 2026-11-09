---
id: "0141"
title: Triage the six blank catalog commands
status: doing
milestone: M8
depends: ["0140"]
---

## Goal

Each of the six remaining `empty` commands in `compat/BROWSER-SWEEP.md` either
renders real content or gets an honest, documented outcome, and any engine bug
found on the way is fixed with a test.

## Context

- Current report (`bun run site:sweep:browser`, catalog commit
  `bad7de0172ce6ea5e721ed919f4e1d7186f74192`): 6 `empty`, 2 `network`.
- The six empties and what is known from their corpus source
  (`.cache/raycast-extensions/extensions/`):
  - `anilist-airing-schedule/index`: view; fetches the AniList GraphQL API.
  - `appgrid/index`: Grid; `getApplications()` is unavailable in a browser, so
    it likely catches the denial and shows no rows.
  - `leetcode/daily-challenge`: view; fetches `leetcode.com/graphql` (CORS).
  - `one-thing/show-one-thing`: `menu-bar`; may legitimately have no items until
    a value is stored, in which case `empty` is honest and should be explained.
  - `one-thing/remove-one-thing`: `no-view`; the sweep shows status
    "Starting…", so the launch never completed. Treat this as a probable engine
    or capability bug and find it.
  - `pinch-svg/custom-rectangle`: view with `LaunchProps<{arguments:{width,height}}>`;
    launched without arguments the command may render nothing.
- `classifyBrowserOutcome` and the settle wait live in
  `examples/browser-demo/browser-sweep.ts`; a new outcome label is only right if
  it names a real, repeatable state (e.g. a network failure that is currently
  swallowed, or a missing-arguments launch).
- Do not add macOS capabilities or proxy network calls: honest `network` /
  `runtime-error` / `needs-preferences` outcomes are acceptable.

## Acceptance

- [x] Each of the six commands is investigated and its final outcome (rendered,
      runtime-error, network, capability-denied, or a justified empty) is listed in
      Handoff with a one-line cause.
- [x] `one-thing/remove-one-thing` no longer sits in "Starting…": either it
      completes, errors, or times out with a typed reason, and the fix has a test.
- [x] Any engine/client bug found is fixed in the shared packages (not patched
      per extension) with a test, and no previously rendered command regresses.
- [x] `compat/browser-sweep.json` and `compat/BROWSER-SWEEP.md` are regenerated
      by `bun run site:sweep:browser`; Handoff lists the new totals.
- [x] `bun run verify` passes.

## Out of scope

- Implementing Selection, Applications or other native capabilities in the
  browser.
- Adding arguments/drafts to the demo so commands that need them render.
- Preference-backed commands (the 51 `needs-preferences` records).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/blank-commands @ <sha>
Verify: <summary line of bun run verify>
Done:
- anilist-airing-schedule/index -> rendered: AniList's GraphQL endpoint allows CORS; the old fixed 2 s settle snapshotted before the 50-cell fetch finished.
- appgrid/index -> empty (justified): the browser answers applications.list with [] because a tab cannot enumerate installed apps, so the Grid shows its own "No results" state; a denial would regress rectangle/index.
- leetcode/daily-challenge -> network: leetcode.com/graphql fails its CORS preflight; the old content marker counted the empty <article class="detail"> as content and snapshotted at 381 ms, before useFetch's failure toast.
- one-thing/show-one-thing -> empty (justified): a menu-bar command returns null when Cache has no "onething"; the sandbox starts with an empty cache so the empty menu bar is correct.
- one-thing/remove-one-thing -> completed ("Removed One Thing"): its background launchCommand used to run a second foreground launch, which replaced the page's capability port and controller so the no-view promise never settled; background launches are now accepted/recorded in the browser client instead.
- pinch-svg/custom-rectangle -> missing-arguments (width, height): the sweep supplies no launch arguments, so the command renders nothing and shows "Invalid Input"; bundle manifests now carry argument declarations and the sweep names that state.
- Added missing-arguments and a loading-timeout outcome; the settle now follows data-loading and DOM quiet instead of a fixed 2 s, and real content wins over incidental network errors.
Not done / risks:
- Background command launches are recorded, not executed: a browser tab has no menu bar or background process, so show-one-thing is not run after remove/set.
- gradle-plugins/index moved rendered -> network: it now waits long enough to see the CORS failure and never leaves isLoading; it has no content to regress.
- input-source-switcher/index's runtime-error text changed from "Selection is unavailable…" to "No text selected" because the settle now catches the extension's own validation; it was already runtime-error.
- compat totals: completed 3, empty 2, missing-arguments 1, needs-preferences 51, network 4, rendered 104, runtime-error 72 (237 records).
```
