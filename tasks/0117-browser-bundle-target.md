---
id: "0117"
title: Browser bundle target from in-memory files with an injected esbuild
status: doing
milestone: M8
depends: []
---

## Goal

`@blastlauncher/host` exports a pure `bundleForBrowser()` that turns an
extension's files, held in memory, plus resolved npm packages, also in memory,
into one browser-target bundle.

The caller passes in the esbuild instance:

- native `esbuild` in tests;
- `esbuild-wasm` on the demo page.

So the same function runs in Node and in a browser.

## Context

- **Decision 0013, items 2, 3 and 5:**
  - bundling happens on the trusted host page and never executes extension
    code;
  - `@raycast/api`, React and the reconciler are bundled in;
  - `node:*` and bare Node built-ins stay external for almostnode;
  - `@raycast/*` is never taken from npm.
- **Reference:**
  - `packages/host/src/bundle.ts` (`bundleCommand`): reuse its alias and
    resolution rules where they are pure.
  - The spike's browser build in `examples/browser-runtime/e2e.ts`.
- **Signature (suggested):**
  `bundleForBrowser({ esbuild, files: Map<path, string|Uint8Array>,
  packages: Map<path, …>, command, runtimeEntry })`.
  - It returns `{ code, warnings, bytes }`.
  - It fails with a typed error for:
    - missing files;
    - unresolved imports, naming the package;
    - native modules (`.node`, known native packages).
  - Resolution uses an esbuild plugin over the in-memory maps. No filesystem
    access in the browser path.
- **Product code:** it runs on Node 24 without a build step. The function must
  not import `node:fs` or `node:path` in the code path a browser uses; use
  POSIX path helpers on strings.

## Acceptance

- [ ] Tests, using native esbuild and in-memory copies of
      `fixtures/extensions/hello-list` and one fixture with a non-Raycast
      dependency:
  - [ ] the bundle evaluates, e.g. with `new Function` in a test harness that
        stubs `require` for `node:*`, and exports the command;
  - [ ] `@raycast/api` resolves to Blast's implementation;
  - [ ] `node:path` stays an external `require`;
  - [ ] an unresolved import gives the typed error naming the package;
  - [ ] a `.node` import gives the native-module error.
- [ ] A test proves the browser code path has no `node:fs` or `node:path`
      imports, using an import-graph check like 0116's.
- [ ] `bun run verify` passes.

## Out of scope

- Fetching sources or packages (0118 and 0119).
- esbuild-wasm wiring in a page (0119).
- Changing `bundleCommand`'s behaviour.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
