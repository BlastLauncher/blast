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
Branch/commit: t3/dependency-usage-scan @ 5a8e257 (also 4aa025b)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 32.0s
Done:
- `scripts/corpus/imports.ts`: shared pure specifier rules (`Source`,
  `unprovidedImports`, `importedPackages`, `packageName`), moved out of
  `selection.ts`; the selector now imports them instead of its own regex.
- `scripts/corpus/dependencies.ts`: `majorOf`, `extensionDependencies`,
  `aggregateDependencies` (imported desc, name asc; cumulative curve) and
  `renderDependenciesMd`; tests in `dependencies.test.ts` (+`imports.test.ts`).
- `scripts/corpus/scan.ts` reads each batch once for both scans and writes
  `compat/dependencies.json` + `compat/DEPENDENCIES.md`.
- Real scan (pin 3b812d1e, 3443 extensions, peak .cache 95.4 MB):
  1573/3443 extensions need nothing beyond api/utils/react/built-ins, 1427
  packages. Curve: 0:1573, 10:1986, 20:2139, 30:2205, 50:2306.
  Top 15 (imported/declared): node-fetch 331/366, axios 200/211,
  date-fns 135/141, run-applescript 96/111, lodash 72/81, zod 64/69,
  cheerio 62/64, dayjs 59/61, fuse.js 49/51, uuid 49/50, nanoid 48/52,
  cross-fetch 46/46, moment 36/39, node-html-markdown 36/39, rss-parser 35/35.
- `.oxfmtrc.json` ignores `compat/DEPENDENCIES.md` like `compat/COVERAGE.md`.
Not done / risks:
- `compat/raycast-usage.json` is byte-identical after the scan (no diff).
- Two scans in a row produced identical `dependencies.json`/`DEPENDENCIES.md`.
- An extension is "satisfied" only when every package it *declares* and every
  package its non-test sources *import* is provided (the selector's combined
  rule). The curve is ranked by `imported`, so declared-only need can keep an
  extension out of the count.
- Import matching is syntactic: a scope-shaped tsconfig alias (`@lib/utils`,
  ~239 imported-only names) counts as a package, as `unprovidedImports`
  already treats it. Specifiers npm could not name (`#imports`, `@/types`,
  `AppKit` from generated Swift text) are dropped. The top 60 is unaffected.
- `.cache/raycast-extensions` deleted after the scan.
```
