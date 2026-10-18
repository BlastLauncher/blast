---
id: "0025"
title: CommonJS globals in bundles; clearer no-view smoke outcomes
status: review
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
Branch/commit: t3/cjs-globals-smoke-outcomes @ HEAD (single feat(0025) commit)
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 20.4s
Done:
- packages/host/src/bundle.ts: esbuild banner defines `__filename`,
  `__dirname` (from `import.meta.url`) and `require`
  (`module.createRequire`) in every ESM bundle; static require calls resolve
  through the existing dependency policy, dynamic requires resolve Node
  built-ins only and throw a MISSING_DEPENDENCY-style error otherwise.
- New fixture `fixtures/extensions/cjs-globals` using all three globals;
  host test covers the rendered scene and the `require("left-pad")`
  MISSING_DEPENDENCY failure (bundle-time, via the existing policy).
- scripts/corpus/smoke.ts classification only: new outcomes `completed`
  (clean no-view exit without a scene, excluded from the failures list) and
  `capability-denied` (matched from the runtime's "Capability denied: <name>"
  crash message, carrying the capability name); menu-bar stays
  unsupported-mode.
- docs/decisions/0002: records the CJS globals and the built-ins-only
  require policy.
- Regenerated compat/smoke.json and compat/SMOKE.md: ego-lite/search-history
  crashed→rendered, google-maps-search/quickSearchMaps
  unsupported-mode→completed, travelHome crashed→capability-denied (0
  crashes, 0 bundle failures remain).
Not done / risks: __filename/__dirname point at the bundled entry in a
temporary build directory, not the extension source (recorded in decision
0002); smoke.ts logic only — smoke-run.ts untouched. .cache/raycast-extensions
deleted after the run.
```
