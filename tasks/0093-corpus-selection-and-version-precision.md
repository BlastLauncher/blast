---
id: "0093"
title: Stable corpus selection and pre-release-aware shared deps
status: doing
milestone: M6
depends: []
---

## Goal

Rerunning `corpus:select` on the same pin changes nothing. Extensions whose
declared version of a shared package is known to be incompatible are not
counted as satisfied. Smoke reports keep enough of a failure to name its cause.

## Context

Findings from the 0090 review:

1. `scripts/corpus/selection.ts:302-304` (`room()`) subtracts the kept set only
   for `list-only`. The `shared-deps` stratum (`:332-335`) asks for its full
   quota of 20 on every run, so the curated set grew from 80 to 100 and would
   reach 120 on the next repin. On an exhausted pool it throws at
   `scripts/corpus/select.ts:130`. The header of `select.ts:3-7` claims
   reproducibility, which is false today. Keep the current 100 extensions;
   only stop further growth. Check `corpus-deps` selection for the same bug.
2. `cilium-docs` declares `cheerio ^1.0.0-rc.12` and does
   `import cheerio from "cheerio"`. The shared `cheerio@1.2.0` ESM entry has no
   default export, so the bundle fails. `scripts/corpus/dependencies.ts:149`
   counts satisfaction by name only. `dependencyWarnings`
   (`packages/shared-deps/src/index.ts:21-32`) compares majors only, and
   `sharedMajorMatch` (`selection.ts:410-416`) prefers such candidates. Treat a
   range that only admits pre-releases of the provided major as a mismatch,
   both when computing `satisfied` and in `dependencyWarnings`. Do not attempt
   to detect export-shape changes in general.
3. `compactLine` (`scripts/corpus/smoke.ts:338-341`) cuts details at 160
   characters, which drops the missing export name from esbuild errors. Keep
   the identifying part of an esbuild error (file, the quoted name, the
   package), while keeping table rows bounded.
4. The TUI smoke peaked at 586 MB against `DEFAULT_MAX_MB = 600`, and only
   `smoke-deps.json` records `peakBytes`. Record the peak in `smoke.json` and
   `tui-smoke.json` too. Do not raise the budget.

After the changes, regenerate only what is generated from data already in the
repo or from manifests (`corpus:scan` needs a manifest-only fetch, within the
default budget). Do not rerun any smoke. If an existing smoke report must
change because of item 3, say so in Handoff instead of rerunning.

## Acceptance

- [ ] A test proves `selectCurated` run twice on its own output returns the
      same set, including on a pool too small to fill a quota.
- [ ] `bun run corpus:select` on the current pin leaves `compat/corpus.json`
      unchanged (100 extensions), shown in Handoff.
- [ ] Tests: `^1.0.0-rc.12` against provided `1.2.0` is a mismatch, `^1.0.0` is
      not, and `dependencyWarnings` reports the former.
- [ ] Handoff gives the new satisfied count from `compat/dependencies.json`
      (it was 2042 of 3493) and how many extensions the change moved.
- [ ] A test shows an esbuild "No matching export" detail keeps the export name.
- [ ] `.cache` is left under 150 MB. `bun run verify` passes.

## Out of scope

- Rerunning smokes, the sweep (0091), adding shared packages or versions.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
