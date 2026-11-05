---
id: "0116"
title: Transport-agnostic runtime core with stdio and postMessage entries
status: doing
milestone: M8
depends: []
---

## Goal

`packages/runtime` runs a command against any message transport.

- The existing stdio entry (`src/main.ts`) behaves exactly as before.
- A new browser entry runs the same protocol over a `postMessage`-style port,
  without `node:module` `registerHooks`, stdio or `process.exit`.

## Context

- Decision 0013, items 1 and 3.
- Spike prototype: `examples/browser-runtime/runtime-entry.ts`. Read it, but
  don't copy its shortcuts.
- **Today:** `src/main.ts` mixes protocol handling (init, load, events,
  capability requests, shutdown) with Node specifics. Those specifics are:
  - the stdin/stdout NDJSON framing;
  - the stdout guard that turns writes into log messages;
  - `registerHooks`;
  - `process.exit`.
- **Shape:**
  - Extract a core, e.g. `src/core.ts`, exporting
    `startRuntime({ send(message), onMessage(listener), exit(code), loadCommand })`.
    `loadCommand` is how each entry obtains the command module: stdio imports
    the bundle file, and the browser entry receives an already-evaluated module
    or a factory.
  - `src/main.ts` becomes the Node adapter around the core.
  - `src/browser.ts` is the port adapter: `{ postMessage, addEventListener }`
    with structured-clone messages of the existing protocol types, validated
    by `parseHostMessage`.
- **No Node imports:** the browser entry must not import any `node:*` module,
  directly or through the core. Enforce this with a test that inspects the
  import graph, e.g. by bundling `src/browser.ts` with esbuild in Node and
  failing on any `node:` import.

## Acceptance

- [ ] Existing runtime, host, CLI, serve and TUI tests pass unchanged.
- [ ] New tests drive `src/browser.ts` over a `MessageChannel` with a
      pre-imported `hello-list` command module:
  - [ ] the first scene;
  - [ ] a search event giving an updated scene;
  - [ ] a `clipboard.copy` capability request answered by the test;
  - [ ] a thrown render error giving an `error` message;
  - [ ] shutdown giving `exit` with no further messages.
- [ ] The import-graph test proves `src/browser.ts` has no `node:` imports.
- [ ] `bun run verify` passes.

## Out of scope

- Bundling, installs and the demo page (0117–0119).
- Changing protocol message types.

## Handoff

```
Branch/commit: t3/runtime-browser-entry @ 9e92c2e4dd8833ffc450c462db25222db1961dda
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 63.4s
Done:
- Extracted transport-neutral runtime lifecycle into `packages/runtime/src/core.ts`.
- Kept Node stdio framing, module hooks, stdout logging, and process exit in `src/main.ts`.
- Added `src/browser.ts` MessagePort adapter with pre-evaluated module or loader support and browser exit notifications.
- Added MessageChannel lifecycle/capability/error tests and a browser-target import-graph bundle test.
- Removed the diagnostics module's Node-only formatting and memory dependency so the browser graph remains Node-free.
Not done / risks: The browser `exit` notification is adapter-local because protocol message types are unchanged, as required by the task.
```
