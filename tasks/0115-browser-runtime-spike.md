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
Branch/commit: t3/browser-runtime-spike @ a301d34c68a4f650ce76bc2f5bc1582be2ea7b70
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 95.9s
Done:
- Added `examples/browser-runtime/e2e.ts`, which starts two 127.0.0.1 servers, drives headless Chromium, and always closes the browser and servers.
- Added a cross-origin iframe transport prototype with scene, search/selection event, fake clipboard capability response, and deliberate DOM/storage isolation probe.
- Added `fixtures/extensions/browser-isolation-probe` for the probe source and documented the measured run in `examples/browser-runtime/README.md`.
- Added `bun run example:browser:e2e`; it installs `almostnode@0.2.14` (16 MiB unpacked) and `playwright@1.58.0` (3.9 MiB package plus 9.6 MiB `playwright-core`) only in the e2e path. Chromium cache measured 547,420 KiB (535 MiB) after Playwright's Chromium, headless shell, and ffmpeg downloads.

Measured findings:

| Item | Result | Evidence / limitation |
|---|---|---|
| 1. first scene via postMessage | PASS | `hello-list` scene with `apple` arrived in the host from the cross-origin iframe. |
| 2. host event updates scene | PASS | `search: ban` reached the iframe and returned only `banana`; selection uses the same event channel. |
| 3. clipboard round trip | PASS | `clipboard.copy` request crossed to the host fake handler and the answered scene was published. No real clipboard was touched. |
| 4. React/API/Node built-ins in almostnode | BLOCKED | The unmodified almostnode browser distribution has bare `pako` and `just-bash` imports. A direct browser load fails before runtime initialization (`Failed to resolve module specifier "just-bash"` after pako was supplied). The fixture transport therefore uses a small browser-safe stand-in; no missing Blast API hits are claimed. |
| 5. esbuild-wasm inside almostnode | NOT RUN | Blocked by item 4 before a sandbox runtime exists. Host-side Bun bundling of the pako helper completed, but this is not evidence for esbuild-wasm in the browser. |
| 6. npm.install walkthrough dependencies | NOT RUN | Requires a functioning almostnode runtime and registry fetch from the browser; no dependency install result is inferred. |
| 7. cold/warm start and bytes | MEASURED | Cold page-to-first-scene: 45 ms; warm reload: 15 ms. Playwright cache: 547,420 KiB (535 MiB). The measured page itself transferred local static assets only; browser download is the cache size above. |
| 8. isolation probe | PASS | Cross-origin iframe reports `parent.document` and `parent.localStorage` as `blocked`; iframe cookie string is empty. |

Changes needed in `packages/runtime` and `packages/host`:

1. Replace `node:module` `registerHooks` and stdin/stdout framing in the browser entry with an injected module resolver and `postMessage` transport.
2. Provide browser-safe aliases for `@raycast/api`, React, and the Node built-ins used by the runtime (`node:stream`, `node:console`, `node:util`, `node:url`); do not rely on the Node-only CJS banner.
3. Make the host bundler emit a browser target with the API shim and React included, while retaining the current Node target for `blast run`.
4. Add an embedder capability bridge that validates and answers `clipboard.copy` (and other capabilities) over the browser message boundary.
5. Add a browser bundling/install path that runs esbuild-wasm and `npm.install` inside the sandbox, with byte/time limits and explicit dependency diagnostics.
Not done / risks: The measured PASS items are the cross-origin transport prototype. The actual Blast React reconciler and `almostnode` sandbox runtime remain blocked on browser-compatible module bundling, so this spike does not support a production browser runtime decision by itself. `playwright install chromium` downloads about 535 MiB into `.cache/ms-playwright`; this is intentionally retained for reproducibility.
```
