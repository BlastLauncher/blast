---
id: "0141"
title: Triage the six blank catalog commands
status: todo
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

- [ ] Each of the six commands is investigated and its final outcome (rendered,
      runtime-error, network, capability-denied, or a justified empty) is listed in
      Handoff with a one-line cause.
- [ ] `one-thing/remove-one-thing` no longer sits in "Starting…": either it
      completes, errors, or times out with a typed reason, and the fix has a test.
- [ ] Any engine/client bug found is fixed in the shared packages (not patched
      per extension) with a test, and no previously rendered command regresses.
- [ ] `compat/browser-sweep.json` and `compat/BROWSER-SWEEP.md` are regenerated
      by `bun run site:sweep:browser`; Handoff lists the new totals.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing Selection, Applications or other native capabilities in the
  browser.
- Adding arguments/drafts to the demo so commands that need them render.
- Preference-backed commands (the 51 `needs-preferences` records).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
