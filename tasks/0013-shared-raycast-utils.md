---
id: "0013"
title: Shared @raycast/utils and dependency policy for bundling
status: doing
milestone: M2
depends: []
---

## Goal

`bundleCommand` bundles real, unmodified extensions without ever installing
their dependencies: `@raycast/api` and `react` stay external (provided by the
runtime), `@raycast/utils` resolves to one copy shipped with Blast, and any
other missing package fails the bundle with a clear, structured error.

## Context

- 2,416 of 3,443 corpus extensions depend on `@raycast/utils`. Add it (exact
  latest version via `npm view`) as a dependency of `packages/host` so exactly
  one copy exists in the workspace. Check and report its install size.
- `@raycast/utils` itself imports `@raycast/api` and `react`; those must stay
  external in the bundle so they resolve to the runtime's modules (one React).
- Resolution order for bare imports in extension code: externals
  (`@raycast/api`, `react`, `react/*`) → Blast-provided packages
  (`@raycast/utils`) → node built-ins → otherwise error. Implement with an
  esbuild plugin; the extension directory's own `node_modules` is never
  consulted (it does not exist; we never install).
- Missing packages: `bundleCommand` rejects with an error whose `code` is
  `MISSING_DEPENDENCY` and lists the package names; the CLI prints them and
  exits 3. This is the signal M3 uses to decide which libraries Blast may
  provide later.
- Record the policy in a short decision record
  `docs/decisions/0002-extension-dependencies.md` (≤ 60 lines).
- Tests use fixtures under `fixtures/extensions/` (no corpus, no network):
  one importing `@raycast/utils` (e.g. `useCachedState` or `showFailureToast`
  — pick something that renders without network), one importing an
  unavailable package.

## Acceptance

- [ ] Fixture using `@raycast/utils` bundles and renders a scene through the
      host; the bundle contains no copy of React or `@raycast/api`.
- [ ] Fixture importing an unavailable package fails with
      `MISSING_DEPENDENCY` naming it; CLI exits 3 with the name printed.
- [ ] Decision record added; `bun run verify` passes.

## Out of scope

- Providing any other third-party package; corpus fetching or scanning.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
