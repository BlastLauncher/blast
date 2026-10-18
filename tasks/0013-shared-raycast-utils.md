---
id: "0013"
title: Shared @raycast/utils and dependency policy for bundling
status: review
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

- [x] Fixture using `@raycast/utils` bundles and renders a scene through the
      host; the bundle contains no copy of React or `@raycast/api`.
- [x] Fixture importing an unavailable package fails with
      `MISSING_DEPENDENCY` naming it; CLI exits 3 with the name printed.
- [x] Decision record added; `bun run verify` passes.

## Out of scope

- Providing any other third-party package; corpus fetching or scanning.

## Handoff

```
Branch/commit: t3/bundle-raycast-utils @ fb3dad673a38a10ec73615057d9abc74fab403f7
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 11.1s
Done:
- Pinned @raycast/utils 2.3.2 (npm view latest) in host: shared helpers for extensions without per-extension installs. Its only direct implementation dependency is dequal; Bun also installed the required @raycast/api peer and its dependency graph.
- Install size: node_modules/.bun grew from 113,782,159 to 154,724,500 bytes (+40,942,341 bytes, 39.05 MiB; 82 packages installed). Utils itself occupies 1,211,160 bytes (1.16 MiB), measured with du -sbL.
- Added esbuild resolution policy, structured MISSING_DEPENDENCY errors with sorted package names, and a post-bundle pass removing unused named shim imports.
- Added offline fixtures/tests for host scene rendering, external React/API, extension-local package isolation, rejection of utils' transitive packages from extension code, and CLI exit 3; 140 tests pass.
- Added docs/decisions/0002-extension-dependencies.md. No API shim changes or compatibility artifact changes needed.
Not done / risks: Utils helpers requiring unimplemented Raycast APIs remain compatibility work; fixture exercises createScriptCommandDeeplink with React state. Auto-installed upstream API/React peers add disk cost but stay external and are never used by runtime bundles. No network in tests or fixture installs; scripts/corpus, PLAN.md, AGENTS.md, and other tasks untouched. Not pushed; independent review pending.
```
