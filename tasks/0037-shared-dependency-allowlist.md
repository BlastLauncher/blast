---
id: "0037"
title: Shared dependency allowlist (interim, until v1)
status: todo
milestone: M3
depends: ["0036"]
---

## Goal

Blast provides one pinned copy of the most-used npm packages to every
extension, the same way it provides `@raycast/utils`, so extensions that
import them bundle instead of failing with `MISSING_DEPENDENCY`.

## Context

- User decision (2026-10-18): interim strategy until the first release. The
  production direction is different — not shipping every package, but a thin
  layer that references the extension repo's own pinned dependencies with
  minimal disk use. Write this down in the decision record so the allowlist is
  not mistaken for the final design.
- Policy lives in `docs/decisions/0002-*.md` (amend it, ≤ 60 lines; Status
  line notes the amendment) and in `dependencyPolicy` in
  `packages/host/src/bundle.ts`. Selection mirrors it in
  `scripts/corpus/selection.ts` (`PROVIDED_DEPENDENCIES`, `PROVIDED_SPECIFIER`)
  — make one exported list in host the single source and use it in both.
- Pick from `compat/dependencies.json` (task 0036) by `imported`, roughly the
  top 20–30, with these filters, each reason recorded in the decision or a
  comment next to the list: pure JavaScript (no native addons, no install
  scripts), reasonable install size (`npm view <pkg> dist.unpackedSize`;
  justify anything over 5 MB; total added to `node_modules` ≤ 60 MB measured
  with `du`), not a browser-automation/CLI-binary package. Pin the major most
  extensions declare (from `majors`) at its latest exact version
  (`npm view <pkg>@<major> version`), not blindly `latest`.
- Packages resolve from the host's dependencies and their graphs are bundled
  (same mechanism as utils). Subpath imports (`date-fns/format`, `lodash/get`)
  must work. An extension that declares a different major still gets ours;
  the CLI should print a one-line `# log` warning naming package, declared
  range and provided version when `package.json` disagrees on major.
- Add host bundle tests with small fixture extensions under `fixtures/` that
  import a provided package (default + subpath import) and one unprovided
  package (still `MISSING_DEPENDENCY`).
- Curated selection keeps its rules but now accepts provided packages; do not
  re-run `corpus:select` (changing the curated set is a later task).
- Report in Handoff: the list with versions and sizes, measured `du -sh
  node_modules` before/after, and how many corpus extensions become
  dependency-satisfied according to the 0036 data.

## Acceptance

- [ ] One exported provided-package list used by bundler and selection.
- [ ] Fixture tests: provided default import, provided subpath import,
      unprovided import fails, major-mismatch warning.
- [ ] Decision 0002 amended (interim, production direction noted).
- [ ] `bun run verify` passes; `bun.lock` updated by `bun install`.

## Out of scope

- Per-extension installs, a shared content-addressed store, or anything that
  runs `npm install` per extension.
- Re-selecting the curated corpus.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
