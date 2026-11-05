---
id: "0123"
title: Typecheck the browser examples with a DOM-aware tsconfig in verify
status: doing
milestone: M8
depends: []
---

## Goal

`bun run verify` typechecks `examples/browser-demo` and
`examples/browser-runtime`, and the real type errors in them are fixed.

Today neither directory is in `tsconfig.json`'s `include`. A wrong property
path (`stats.covered` instead of `stats.coverage.covered`) shipped as
"undefined/undefined" on the landing page in 0121 and was caught only by a
screenshot.

## Context

- **Root config:** the root `tsconfig.json` targets Node (`lib: ["esnext"]`,
  `types: ["node", "bun"]`).
- **Why a separate config:** adding the two directories to the root config
  gives 103 errors. Most are missing DOM types in browser code (`document`,
  `window`, `Navigator.clipboard`, `MessageEvent`), plus imports of
  `esbuild-wasm` and Playwright that resolve only from `.cache` on the e2e
  path.
- **Real mismatches** to fix rather than silence:
  - a `SceneMessage` passed where the runtime protocol type is expected;
  - `BrowserFile` passed where `string` is expected;
  - the `installForBrowser` options object, where `exactOptionalPropertyTypes`
    rejects `lockfile: undefined`;
  - `unknown` values in the e2e's `waitForFunction` arguments.
- **Shape:**
  - Add `tsconfig.browser.json`, extending the root, with
    `lib: ["esnext", "dom", "dom.iterable"]` and no `node` types. It covers
    browser-only files (e.g. `examples/browser-demo/client.ts`, `root.ts`,
    `runtime-entry.ts`).
  - Server, build and e2e files (`main.ts`, `site.ts`, `build.ts`, `e2e.ts`,
    `site-e2e.ts`, `examples/browser-runtime/e2e.ts`) join the root config.
  - The verify `typecheck` step runs both configs.
- **Dependencies that aren't installed in verify:**
  - Declare minimal ambient types for `esbuild-wasm`, the subset of its API
    the client uses, in a local `.d.ts`.
  - For the dynamic Playwright import, type it as the small subset the e2e
    uses. Do not add Playwright or esbuild-wasm to the root dependencies.

## Acceptance

- [ ] `bun run typecheck` checks both configs, and includes every `.ts` file
      under `examples/browser-demo` and `examples/browser-runtime`.
- [ ] Zero errors, with no `@ts-ignore`, `@ts-nocheck` or `any` added to
      silence real mismatches. Each fix of a real bug is listed in the
      Handoff.
- [ ] A deliberate type error, such as reintroducing `stats.covered`, fails
      `bun run verify`. Show it, then revert it.
- [ ] `bun run site:e2e` and `bun run example:browser-demo:e2e` still pass.
      Run them with `PLAYWRIGHT_BROWSERS_PATH` from the environment.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Never write absolute personal paths into files.
- 127.0.0.1 servers only, always closed.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- Behaviour changes beyond the real type bugs.
- Deployment (0122).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
