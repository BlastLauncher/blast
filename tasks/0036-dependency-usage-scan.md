---
id: "0036"
title: Corpus dependency usage scan
status: doing
milestone: M3
depends: []
---

## Goal

`bun run corpus:scan` also records which npm packages corpus extensions
depend on and import, so the shared-dependency allowlist (task 0037) is picked
from data. Output: `compat/dependencies.json` plus `compat/DEPENDENCIES.md`.

## Context

- `scripts/corpus/scan.ts` already does the sparse batched scan of all
  extensions (manifests via `MANIFEST_PATTERN` + `src/**` sources) and writes
  `compat/raycast-usage.json` through pure helpers in `scripts/corpus/usage.ts`.
  Extend the same pass; do not add a second clone or fetch.
- Per package (excluding `@raycast/api`, `@raycast/utils`, `react`, Node
  built-ins, and `@types/*`), record:
  - `extensions`: number of extensions declaring it in `dependencies`
    (not `devDependencies`);
  - `imported`: number of extensions whose non-test sources import it
    (reuse the import-specifier logic of `unprovidedImports` in
    `scripts/corpus/selection.ts`; move it to a shared pure helper rather than
    duplicating the regex);
  - `majors`: map of declared major version (from the range, e.g. `^2.6.1` →
    `2`, `latest`/`*`/unparseable → `"other"`) → extension count.
- Also record, for the whole corpus: how many extensions need nothing beyond
  api/utils/react/built-ins, and a cumulative curve: for N = 10, 20, 30, 50,
  how many extensions become fully satisfied if the top-N packages by
  `imported` were provided.
- `compat/DEPENDENCIES.md`: the corpus summary, the curve, and a top-60 table
  (package, imported, declared, top major with its share). Generated, deterministic
  ordering (count desc, name asc). Pure aggregation functions get fixture tests.
- Run the real scan once to regenerate `compat/` (disk guard
  `BLAST_CORPUS_MAX_MB` applies; never `git ls-tree -l` or anything that
  fetches blobs outside the sparse patterns). Delete `.cache/raycast-extensions`
  afterwards. `raycast-usage.json` must not change except if the scan itself
  was already stale (explain in Handoff).
- Never `npm install` anything inside the corpus.

## Acceptance

- [ ] Unit tests for major parsing, import counting (test files ignored) and
      the cumulative curve, on fixture manifests/sources.
- [ ] `compat/dependencies.json` and `compat/DEPENDENCIES.md` committed from a
      real scan; Handoff pastes the top 15 rows and the curve.
- [ ] `bun run verify` passes.

## Out of scope

- Providing any package or changing `packages/host/src/bundle.ts` (task 0037).
- Changing the curated selection.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
