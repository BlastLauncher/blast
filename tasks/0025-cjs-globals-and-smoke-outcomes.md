---
id: "0025"
title: CommonJS globals in bundles; clearer no-view smoke outcomes
status: doing
milestone: M3
depends: []
---

## Goal

Extensions written for Raycast's CommonJS build (`__filename`, `__dirname`,
`require`) run in Blast's ESM bundles, and the smoke report stops labelling
successful no-view commands as `unsupported-mode`.

## Context

- `compat/SMOKE.md`: `ego-lite/search-history` crashes with
  `__filename is not defined`. Raycast bundles extensions as CommonJS; Blast
  emits ESM (`packages/host/src/bundle.ts`). Provide the globals without
  changing extension code: an esbuild `banner` defining `__filename`,
  `__dirname` (from `import.meta.url`) and `require`
  (`module.createRequire(import.meta.url)`) — then decide what `require` may
  load: Node built-ins only, consistent with decision 0002; anything else
  throws `MISSING_DEPENDENCY`-style errors. Update decision 0002.
- Smoke outcomes (`scripts/corpus/smoke.ts`): a `no-view` command that exits 0
  without a scene is `completed`; `menu-bar` stays `unsupported-mode`.
  `google-maps-search/travelHome` fails because the deny-all broker rejects
  `open.url` — classify capability denials as `capability-denied` with the
  capability name.
- Re-run `bun run corpus:smoke`, commit reports after `bun run fmt`.
- Other workers change Cache/support paths (0024) and capability APIs (0026)
  in parallel; avoid `session.ts` and API files.

## Acceptance

- [ ] Fixture extension using `__filename`, `__dirname` and
      `require("node:path")` runs; `require("left-pad")` fails clearly.
- [ ] Smoke classification tests for `completed` and `capability-denied`.
- [ ] `bun run verify` passes.

## Out of scope

- Switching the bundle format to CommonJS.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
