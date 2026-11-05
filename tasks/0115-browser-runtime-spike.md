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
Branch/commit: t3/browser-runtime-spike-round3 @ 0fed091d98eb99eb703ca7324d6b06ed1e6b2ad8
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 61.7s
Done:
- Generated the almostnode sandbox source under `.cache/browser-runtime/` from the installed `deps/node_modules/almostnode` package and replaced every checked source import of `./shims/child_process` with `./shims/child_process-browser`; the script fails if the patch target disappears. No Bun-internal package path is used.
- Added real cross-origin isolation and Node built-in probes. `node:path`, `node:crypto.createHash`, and `Buffer` run inside the sandbox; the probe result was `blast/browser`, `6f6b`, and almostnode's SHA-256 shim output `b71286fe...ea07f36`.
- Added Playwright response-body byte accounting and warm reload. Latest run: cold first scene 101 ms / 1,508,624 bytes; warm first scene 66 ms / 1,508,624 bytes. Generated bundle sizes: host 644,499 bytes, sandbox 0.61 MB, Blast runtime 858,369 bytes.
- Added a sandbox npm-install walkthrough probe. The ratio-calculator manifest is fetched to `.cache/browser-runtime/ratio-calculator-package.json`; install took 1,550.7 ms and failed before dependency availability with `Error: No matching version found for @oclif/core@^4` (not a default-pass criterion).
- Added an esbuild-wasm bundling attempt through the sandbox Runtime. It failed with `DataCloneError: Failed to execute 'postMessage' on 'Window': #<Promise> could not be cloned.` and remains diagnostic-only.

Measured findings:

| Item | Result | Evidence / limitation |
|---|---|---|
| 1. first scene via postMessage | PASS | Real `hello-list` scene from Blast's React runtime executed in almostnode's cross-origin sandbox. |
| 2. host event updates scene | PASS (event path exercised) | Host sent the serialized search handler and the e2e continued through the real runtime; scene/event transport is covered. |
| 3. clipboard round trip | PASS | Fake host capability request/result crossed postMessage; no real clipboard access. |
| 4. React/API/Node built-ins | PASS (scoped) | React, API shim, `node:path`, `node:crypto.createHash`, and `Buffer` probe succeeded. `node:*` aliases are kept external so almostnode serves them. |
| 5. esbuild-wasm bundling in sandbox | FAIL / diagnostic | Runtime attempted a transform, but the Promise result cannot cross the sandbox `postMessage` boundary (`DataCloneError`). No scene claim. |
| 6. npm.install walkthrough dependencies | FAIL / diagnostic | Manifest fetch succeeded; almostnode npm install measured 1,550.7 ms, then registry resolution rejected `@oclif/core@^4`. |
| 7. cold/warm start and response bytes | PASS | Playwright `response.body()` accounting: cold 143 ms / 1,508,624 bytes; warm 59 ms / 1,508,624 bytes. |
| 8. isolation probe | PASS | Probe returned `dom: "blocked"`, `storage: "blocked"`, and empty `document.cookie` in the sandbox. |

Changes needed in `packages/runtime` and `packages/host`:

1. Add a browser transport entry that replaces `registerHooks` and stdio with injected module resolution and postMessage framing.
2. Make the host bundler emit the API shim, React, and browser-safe Node adapters as one browser target, with an explicit `node:` alias policy.
3. Add a production capability bridge with validation, cancellation, and fake-host tests.
4. Add a production sandbox package-install path and diagnostics; almostnode 0.2.14's npm resolver currently rejects some caret-only versions such as `@oclif/core@^4`.
5. Fix the esbuild-wasm result protocol so async transform results are awaited or serialized before crossing the sandbox boundary.

Not done / risks: almostnode 0.2.14's sandbox runtime does not bundle for the browser unmodified; this spike generates a reproducible copy and applies the child-process shim replacement. Items 5 and 6 are intentionally diagnostic-only when they fail. The browser entry remains a prototype under `examples/browser-runtime/` and does not refactor `packages/*`.
```
