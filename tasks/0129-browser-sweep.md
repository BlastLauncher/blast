---
id: "0129"
title: Browser catalog sweep (every catalog command, headless) with a generated report
status: doing
milestone: M8
depends: []
---

## Goal

`bun run site:sweep:browser` opens every catalog command in headless Chromium,
using a local production site build, and records each command's outcome. It
writes `compat/browser-sweep.json` and `compat/BROWSER-SWEEP.md`, the browser
counterpart of `compat/SWEEP.md`.

## Context

- **Build and serve:**
  - Build with `site:build`: production, no `--fixtures`, with
    `--sandbox-url http://127.0.0.1:<port>/blast-sandbox/`.
  - Serve it like `site:e2e`'s static server.
  - Reuse the Playwright bootstrap in `examples/browser-demo/site-smoke-browser.ts`.
- **Per command:**
  - Open `/demo/?ext=<name>&cmd=<command>`, the deep link.
  - Wait up to 15 s for the first scene.
  - Classify the outcome. The classifier is a pure function with unit tests:
    - `rendered` (a list, detail, form or grid with content);
    - `empty` (rendered with no rows and no empty view);
    - `capability-denied:<name>`;
    - `network` (CORS or fetch errors);
    - `runtime-error:<first line>`;
    - `bundle-fallback-failed`;
    - `timeout`.
  - Record any `pageerror` and console errors, trimmed.
  - Use a fresh page per command, and tear down the session.
- **Report:**
  - Totals, a table of failures grouped by signature with command counts and
    up to 5 examples each, and the capability usage counts.
  - Deterministic ordering, with a commit and date header like
    `compat/SWEEP.md`.
- **Parallelism:** a small concurrency of 3–4 pages. Report wall time.
- **Not in verify:** it needs a browser and network. Add an
  `examples/browser-demo` unit test for the classifier only.

## Acceptance

- [ ] The classifier has unit tests covering each outcome.
- [ ] One full run over the 237 commands. `compat/BROWSER-SWEEP.md` and the
      JSON are committed, and the Handoff quotes the totals and the top 5
      failure signatures.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; never write absolute
  personal paths into files; never download Chromium.
- Stub `navigator.clipboard` and `window.open` in tests and sweeps.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build, sweep and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep `.cache` growth under about 150 MB.
- Gate commits on exit codes, not piped output.

## Out of scope

- Fixing the failures. The orchestrator dispatches follow-ups from the report.

## Handoff

```
Branch/commit: t3/browser-sweep-classifier @ 27eac00
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 104.1s
Done:
- Added headless production-site Chromium sweep with four-page concurrency, fresh pages, loopback serving, clipboard/open stubs, trimmed browser diagnostics, and deterministic JSON/Markdown reports.
- Added pure outcome classifier tests for rendered, empty, capability-denied, network, runtime-error, bundle-fallback-failed, and timeout.
- Ran all 237 catalog commands: capability-denied 82, empty 15, network 1, rendered 34, runtime-error 105, total 237.
- Top five failure signatures: runtime-error: Cannot find module stream/promises (80); capability-denied: applications.list (50); capability-denied: storage.get (18); runtime-error: Cache requires an assigned support directory (15); runtime-error: Runtime failed: Error: Error: Cache requires an assigned support directory (8).
Not done / risks: The sweep records current browser behavior; failures are intentionally not fixed. One command timed out into the current Ready signature and one command was classified network; generated reports include the full per-command diagnostics.
```
