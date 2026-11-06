---
id: "0131"
title: "Browser sandbox gaps: stream/promises and the Cache support directory (103 commands)"
status: todo
milestone: M8
depends: []
---

## Goal

The two largest runtime-error groups in `compat/BROWSER-SWEEP.md` (0129) are
gone, and a re-run sweep shows the gain:

- `Cannot find module 'stream/promises'`, 80 commands;
- `Cache requires an assigned support directory`, 15 + 8 commands.

## Context

- **`stream/promises`:**
  - **Problem:** bundles leave Node built-ins external for almostnode to
    provide (decision 0013), but almostnode 0.2.14 has no `stream/promises`.
  - **First:** find out which import pulls it in for these 80 commands (a
    shared library such as `@raycast/utils`, or each extension). Record that
    in the Handoff.
  - **Fix:** map `stream/promises` and `node:stream/promises` to a small
    bundled shim. It should provide `pipeline` and `finished` built on
    almostnode's `stream`, for example via `util.promisify(stream.pipeline)`.
  - **Where:** in the shared `examples/browser-demo/bundle-config.ts`, so the
    prebuild and on-demand paths agree.
  - **Other subpaths:** check whether other built-in subpaths almostnode lacks
    are imported anywhere in the catalog bundles (e.g. `fs/promises`,
    `timers/promises`, `util/types`). Shim only the ones that are missing and
    actually used, and list them in the Handoff.
- **Cache:**
  - **Problem:** `packages/runtime/src/api/cache.ts` needs
    `environment.supportPath`. The demo's init sends `supportPath: ""`
    (`examples/browser-demo/client.ts`).
  - **Fix:** give each extension a support path, and an assets path if
    useful, inside the sandbox's virtual filesystem, e.g.
    `/blast/support/<extension>`. Create it in the almostnode VFS before
    execution, and pass it in init.
  - **Note:** Cache data then lives in the sandbox's memory for the session,
    which is acceptable for a demo. Say so in the README.
- **Ports:**
  - `site:e2e` and `site:sweep:browser` use fixed local ports.
  - 0128 and 0130 run in parallel in other worktrees and may run `site:e2e`.
  - If a port is busy, wait and retry rather than killing anything.
- **Classifier bug:** fix it in passing. It reports a "Ready" status as
  `runtime-error:Ready` (`uk-bank-holidays/index`). Add a unit test.

## Acceptance

- [ ] Unit tests:
  - [ ] the shim's `pipeline` and `finished`, run against Node's `stream` as a
        stand-in;
  - [ ] the bundle config maps both specifiers;
  - [ ] the classifier's "Ready" case.
- [ ] A fixture command that uses `Cache` and `stream/promises`, and renders in
      `site:e2e`.
- [ ] A re-run of `bun run site:sweep:browser`:
  - [ ] the regenerated `compat/BROWSER-SWEEP.md` and JSON are committed;
  - [ ] there are 0 `stream/promises` and 0 support-directory signatures;
  - [ ] the Handoff gives the before and after totals and the new top 5
        signatures.
- [ ] `bun run verify` and `bun run site:e2e` pass.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; no absolute personal paths
  in files; never download Chromium.
- Stub `navigator.clipboard` and `window.open`.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build, sweep and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep `.cache` growth under about 150 MB.
- Gate commits on exit codes.

## Out of scope

- Capability handlers: 0128 is in flight; `applications.*` and the rest follow
  it.
- Ranking (0130).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
