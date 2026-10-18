---
id: "0015"
title: Generated stubs so every @raycast/api symbol exists and fails clearly
status: doing
milestone: M3
depends: []
---

## Goal

Every runtime-visible `@raycast/api` export in the inventory exists in Blast's
module. Using one that Blast has not implemented fails with a structured
`UNSUPPORTED_API` error naming the exact path (e.g. `Action.OpenInBrowser`),
instead of an ESM link error or React's "element type is invalid".

## Context

- Today `compat/SMOKE.md` shows 12/13 curated commands crashing: 6 on missing
  exports (`Detail`, `Icon`, `Color`, `Keyboard`, `CopyToClipboardAction`),
  6 on undefined sub-components (likely `Action.OpenInBrowser`).
- Generate, don't hand-write: `scripts/compat/generate-stubs.ts` reads
  `compat/raycast-api.inventory.json` and writes
  `packages/runtime/src/api/unsupported.generated.ts`. Only value-level kinds
  matter (`namespace`, `component`, `function`, `const`, `class`, `enum`);
  skip `interface`/`type`.
- Stub behaviour: a component stub throws when rendered; a function stub
  throws (or rejects, for APIs that return promises in the declarations) when
  called; property access on a stub returns the stub for the child path, so
  `Detail.Metadata.Label` works as a path. The thrown error is an
  `UnsupportedApiError` with `code: "UNSUPPORTED_API"` and `path`.
- Partially implemented namespaces (`List`, `Action`, `ActionPanel`,
  `Clipboard`, …): missing members must resolve to stubs too, e.g. wrap
  implemented exports so unknown inventory child paths return stubs.
  Implemented members are unchanged.
- `packages/runtime/src/api/index.ts` exports implemented symbols plus the
  generated stubs for everything else; a test asserts every value-level
  top-level inventory name is exported.
- Runtime: an `UnsupportedApiError` (thrown or rejected) becomes a fatal
  `error` with code `UNSUPPORTED_API` and the path in the message. The smoke
  runner (`scripts/corpus/smoke.ts`) classifies it as a new outcome
  `unsupported-api` with the path.
- Stubs are **not** coverage: no `@covers` tags for them.
- Verify: the stub file must match regeneration (extend `compat:check`).

## Acceptance

- [ ] Tests: missing top-level export, missing nested component, missing
      function (sync and promise-returning) each produce `UNSUPPORTED_API`
      with the right path; implemented symbols are untouched.
- [ ] A runtime process test shows the fatal `UNSUPPORTED_API` error.
- [ ] Re-run `bun run corpus:smoke`, commit the updated `compat/SMOKE.md`
      / `smoke.json` (run `bun run fmt`), and list the newly named missing
      paths in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing any of the stubbed APIs (task 0016 and later).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
