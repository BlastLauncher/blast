---
id: "0115"
title: "Spike: Blast runtime inside almostnode in a headless browser"
status: doing
milestone: M8
depends: []
---

## Goal

Find out, with a measured run rather than reasoning, whether a Raycast
extension command can render through Blast's runtime inside
[almostnode](https://github.com/macaly/almostnode) (MIT, Node 20 emulation in
the browser), running in a cross-origin sandbox iframe and driven from a host
page.

The output is:

- a working prototype under `examples/browser-runtime/`;
- one automated end-to-end check;
- a findings table in the Handoff.

The orchestrator then writes decision 0013 from those findings.

## Context

- **Runtime:** `packages/runtime/src/main.ts` speaks NDJSON over stdin and
  stdout, defined in `packages/protocol`. It uses `node:module`
  `registerHooks`, presumably to resolve `@raycast/api`, plus `node:stream`,
  `node:console`, `node:util` and `node:url`.
  - Inside almostnode, assume there is no child process or IPC.
  - Find the smallest change that works. For example, alias `@raycast/api` at
    bundle time instead of `registerHooks`, and use a message transport
    instead of stdio.
  - Prototype it under `examples/browser-runtime/` first. Do not refactor
    `packages/runtime` in this task; list the needed changes in the Handoff.
- **Bundling:**
  - The host bundler, esbuild via `packages/host/src/bundle.ts`, runs in Node.
  - For the spike, pre-bundle the fixture in Node, then try bundling inside
    almostnode with esbuild-wasm. Report both.
- **almostnode facts:**
  - **Version:** 0.2.14, last published 2026-02, 16 MB unpacked.
  - **Untrusted code:** its README requires untrusted code to run through
    `createRuntime(vfs, { sandbox: "<cross-origin url>" })`. That URL needs
    `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy:
    cross-origin`.
  - **Execution:** `createContainer` and `execute` run on the main thread and
    must not be used with untrusted code.
  - **Packages:** `npm.install` fetches packages in the browser.
- **Two origins:** two local static servers on 127.0.0.1, with different ports,
  stand in for the host page and the sandbox origin.
- **Browser:**
  - Use headless Chromium through `playwright`; pin exact latest versions.
  - Install browsers with `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright`, so
    they stay out of the user's home directory and get cleaned with `.cache`.
  - Justify every new dependency in the Handoff, with its size.
- **Not in verify:**
  - The end-to-end check needs a browser and npm registry network. Add it as
    `bun run example:browser:e2e`, outside `bun run verify`, as the AGENTS
    network rule requires.
  - Pure helpers with unit tests may be in verify.

## Measure and report (Handoff table)

1. Does `fixtures/extensions/hello-list` produce its first scene, with its JSON
   received by the host page via `postMessage`?
2. Does a host event, such as a search or selection, reach the extension and
   produce an updated scene?
3. Does a capability request (`clipboard.copy`) round-trip to the host page and
   come back answered?
4. Do the fixture bundle's React, `@raycast/api` shim and Node built-ins work
   inside almostnode? List every missing or stubbed API hit.
5. Does esbuild-wasm bundling inside almostnode work, and how long does it
   take?
6. Does `npm.install` of a real extension's dependencies work? Use one
   walkthrough extension from `docs/walkthroughs/`, fetched as files into
   `.cache/`. Record the time and the bytes transferred.
7. **Cold start:** page load until the first scene, with a warm cache and a
   cold cache, and the total bytes downloaded.
8. **Isolation:** confirm sandboxed code cannot read the host page's DOM,
   cookies or localStorage. Write a deliberate probe extension under
   `fixtures/`.

## Safety (hard rules)

- Headless browser only. Never open a visible browser, run `open`, or touch the
  real clipboard; a fake handler on the host page answers capabilities.
- Servers bind to 127.0.0.1 and are always shut down.
- Network only to the npm registry and GitHub or jsDelivr for the extension
  files, and only from the e2e script.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Acceptance

- [ ] `bun run example:browser:e2e` runs headless Chromium. It passes when
      items 1–3 work and fails with a clear message naming the failing step.
- [ ] The Handoff has the measured table for items 1–8, plus "changes needed
      in packages/runtime and packages/host" as a numbered list.
- [ ] `bun run verify` passes and does not run the browser test.

## Out of scope

- The URL-loading UI and GitHub fetching beyond item 6.
- Production hosting or deployment.
- Refactoring `packages/*`.
- Writing decision 0013; the orchestrator writes it.

## Handoff

```
Branch/commit: t3/browser-runtime-spike-round2 @ b3ac660dc023f10fa59160eb203b9e09f57acc6e
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 61.3s
Done:
- Replaced the stand-in command with a browser-target bundle of `hello-list`, Blast's reconciler, the local `@raycast/api` shim, React, and React Reconciler.
- Bundled almostnode under `.cache/` and executed the Blast bundle through its cross-origin `SandboxRuntime`; no edits or string replacement are made to published `dist/index.mjs`.
- Added real scene, search event, and `clipboard.copy` capability round trips over postMessage. The default e2e fails if a real scene is not received.
- Honoured an existing `PLAYWRIGHT_BROWSERS_PATH`; the script never downloads Chromium.

Measured findings:

| Item | Result | Evidence / limitation |
|---|---|---|
| 1. first scene via postMessage | PASS | Real `hello-list` React scene from Blast's runtime executed inside almostnode (`List` with apple, banana, cherry). |
| 2. host event updates scene | PASS | Host dispatched the serialized `onSearchTextChange` handler; the real scene updated to banana. |
| 3. clipboard round trip | PASS | Host dispatched the real `Action.CopyToClipboard` handler; `clipboard.copy` crossed the capability bridge and was answered by a fake host result. |
| 4. React/API/Node built-ins in almostnode | PASS (scoped) | React, React Reconciler, the local API shim, and the browser-safe runtime imports worked. Node-only `registerHooks`, stdio, and `node:*` imports are not used by this browser entry and remain changes needed for production. |
| 5. esbuild-wasm inside almostnode | NOT RUN | The spike now executes a pre-bundled runtime; no esbuild-wasm operation was attempted. |
| 6. npm.install walkthrough dependencies | NOT RUN | No walkthrough dependency install was attempted; this needs a separate registry measurement inside the sandbox. |
| 7. cold/warm start and page bytes | PARTIAL | Cold page-to-first-scene was 107 ms. Page assets downloaded 2,389,837 bytes (host and sandbox almostnode bundles combined 602,505 + Blast runtime 1,787,332; exact browser transfer should be measured with response accounting). Warm reload was not run. |
| 8. isolation probe | NOT RUN | The real runtime scene path is proven, but the probe extension was not wired into this round's runtime bundle; no isolation claim is made. |

Changes needed in `packages/runtime` and `packages/host`:

1. Add a browser transport entry that replaces `registerHooks` and stdio with injected module resolution and postMessage framing.
2. Make the host bundler emit the API shim, React, and browser-safe Node adapters as one browser target.
3. Add a production capability bridge with validation, cancellation, and fake-host tests.
4. Add a sandbox bundle/install path for esbuild-wasm and `npm.install`, with byte/time diagnostics.
5. Add a real cross-origin isolation probe to the browser runtime fixture.

Not done / risks: Items 5, 6, and 8 remain unmeasured. Item 7 reports generated bundle bytes rather than Chromium cache size; warm-cache response accounting still needs to be added. The browser entry is a prototype under `examples/browser-runtime/` and does not refactor `packages/*`.
```
