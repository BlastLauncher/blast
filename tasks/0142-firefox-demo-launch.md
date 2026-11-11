---
id: "0142"
title: Demo commands launch in Firefox
status: doing
milestone: M8
depends: ["0141"]
---

## Goal

The browser demo launches commands in Firefox-based browsers (Firefox, Zen)
as it does in Chromium, and a Firefox lane in the e2e harness keeps it that
way.

## Context

- Reported 2026-11-11: on blast.yukai.dev/demo/ in Zen (Firefox engine),
  choosing "Nano Games › Play Nano Snake" stays on "Starting…" forever. The
  same command renders in Chrome and in the Chromium sweep
  (`compat/browser-sweep.json`). Nano Snake uses only LocalStorage, Cache and
  timers, so expect the hang to be general (sandbox iframe start-up, message
  passing, bundle fetch, or esbuild-wasm), not specific to that extension.
  Check a fixture command and a second catalog command too.
- Every browser test is Chromium-only today: `examples/browser-demo/e2e.ts`,
  `site-e2e.ts`, `site-smoke-browser.ts`, `browser-sweep.ts` all import
  `chromium` from the Playwright 1.58.0 copy in `.cache/browser-demo/deps`.
- The "Starting…" UI is `drawStarting` / `sessionStarting` in
  `examples/browser-demo/client.ts`; the sandbox origin and iframe protocol are
  in decision 0013 and `examples/browser-demo/build.ts` / `site.ts`.
- Headless Firefox does not start on the maintainer's macOS (graphics
  compositor crash before any page loads). Run Firefox on Linux instead:
  OrbStack Docker is available locally (`mcr.microsoft.com/playwright:v1.58.0-noble`
  ships Firefox 1509), and CI runs `ubuntu-24.04`. Playwright Firefox 1509 is
  in `PLAYWRIGHT_BROWSERS_PATH` given to you as an env var; never commit that
  path. Disk is tight: pull at most that one image and remove it when done
  (`docker image rm`).

## Acceptance

- [ ] Root cause of the Firefox "Starting…" hang is named in Handoff and fixed
      in shared demo/runtime code (not per extension), with a unit test that
      fails without the fix where the cause is testable outside a browser.
- [ ] `bun run site:e2e -- --browser firefox` (or an equivalent flag on the
      existing harness; Chromium stays the default) launches a fixture command
      and `nano-games/play-nano-snake` from the catalog in Firefox and asserts
      rendered content, not "Starting…".
- [ ] `.github/workflows/site.yml` (or `ci.yml`) runs that Firefox lane on
      `ubuntu-24.04`, installing only `firefox` for it.
- [ ] Chromium e2e and `bun run site:sweep:browser` results do not regress.
- [ ] A launch that never settles shows a typed timeout/error in the status
      line instead of "Starting…" forever, in any browser, with a test.
- [ ] `bun run verify` passes.

## Out of scope

- Running the full catalog sweep in Firefox on every CI run.
- Safari/WebKit.
- Launcher UI redesign (task 0143).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/firefox-demo-launch-fixes @ 534ece2
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 89.0s
Done:
- Replaced the fixed 100 ms runtime-port transfer with a request/response handshake, fixing the Firefox startup race in shared demo/runtime code.
- Scoped typed startup timeouts to runtime port and first-scene stages, preserving slow dependency fetch/install/bundle launches.
- Added launch generations so stale asynchronous launches cannot update a newer session or the root list, with focused unit tests for timeout stages and invalidation.
- Added `--browser chromium|firefox` to the site e2e harness; Chromium remains the default and Firefox covers the fixture and Nano Snake catalog launch.
- Added a dedicated Ubuntu 24.04 Firefox CI job that installs only Firefox.
Not done / risks: Firefox runs a focused startup lane because the broader interaction assertions assume macOS keyboard semantics; Chromium retains the full interaction suite.
E2E:
- `{"pass":true,"browser":"chromium","site":"http://127.0.0.1:4175/","sandbox":"http://127.0.0.1:4176/blast-sandbox/"}`
- `{"pass":true,"browser":"firefox"}`
```
