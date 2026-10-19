---
id: "0048"
title: Curated set v4 — extensions using shared dependencies
status: doing
milestone: M3
depends: []
---

## Goal

The curated smoke set gains ~20 extensions that import packages from the
shared dependency allowlist (task 0037), and `compat/SMOKE.md` reports how
they fare, so real breakage from shared majors or missing APIs shows up.

## Context

- Selection: `scripts/corpus/selection.ts` / `select.ts` (strata, quotas and
  exclusions from tasks 0023/0033); the provided-package list comes from the
  host (`packages/host/src/dependencies.ts`). Add a feature stratum
  "shared-deps" (extensions whose deps ⊆ provided and that import at least one
  allowlisted package), quota 20, keeping every existing pick unchanged (the
  additive `FeatureStratum` mechanism exists for this). Prefer a spread across
  different packages (node-fetch, axios, date-fns, lodash, zod, cheerio, dayjs,
  …) and prefer extensions whose declared major matches the provided one;
  record the rule. Same exclusions as before (child_process, applescript,
  filesystem writes, native modules, unprovided imports).
- Network: commands that fetch from the internet at startup will fail offline
  in smoke — smoke runs offline with a deny-all broker. Prefer extensions
  whose first render does not require network (static data, user input
  first); classify network failures distinctly in the smoke report if the
  existing outcomes cannot tell them apart (e.g. `network` outcome for
  fetch/ENOTFOUND errors) rather than counting them as crashes.
- Run `bun run corpus:select` then `bun run corpus:smoke` (sparse, disk
  guard; never `git ls-tree -l`/`git cat-file -s`; delete
  `.cache/raycast-extensions` afterwards). Commit `compat/corpus.json`,
  `compat/smoke.json`, `compat/SMOKE.md` after `bun run fmt`.
- Do not fix API gaps found in this task; list each non-rendered command with
  its cause in Handoff so the orchestrator can create follow-up tasks.

## Acceptance

- [x] Selection tests for the new stratum (fixture manifests).
- [x] New smoke report committed; Handoff has the outcome summary line and a
      table of every non-rendered command with cause.
- [x] `bun run verify` passes.

## Out of scope

- Fixing compatibility bugs surfaced by the new extensions.

## Handoff

```
Branch/commit: t3/curated-set-v4-sticky-picks @ (see git log; round 2 fixup)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 61.8s
Done (round 2 — review finding: prior picks were not sticky):
- Cherry-picked round 1's two commits (785468c, 04f4948 — the shared-deps
  stratum, `imports.ts`, the "network" smoke outcome, and their tests) onto
  the current integration tip; `git merge --ff-only` was not possible since
  v3/restart had moved on (tasks 0047/0049) past round 1's base, so the net
  content was reapplied with cherry-pick instead.
- Fixed the sticky-picks bug: `select.ts` now reads the *currently committed*
  `compat/corpus.json`'s `curated` list (`previousCurated`) instead of the
  fixed 10-name `KEPT_CURATED` constant, and fails loudly
  (`previously curated extensions missing from the pin: ...`) if any of those
  extensions no longer exists at the pinned corpus commit.
- Added `STICKY_QUOTAS` to `scripts/corpus/selection.ts`: every stratum but
  `shared-deps` is frozen at 0, so `selectCurated(previousCurated, analyzed,
  STICKY_QUOTAS)` cannot add or drop a single pick in form/detail/utils/
  list-only/grid/menu-bar/action-variants/selection-apis just because the
  provided-dependency list grew — only `shared-deps` (quota 20) still draws
  fresh picks from the live candidate pool. `select.ts` passes the same
  quotas to `offlineQuotasMet` so the scan loop stops as soon as shared-deps
  capacity is satisfied. `selectCurated`'s existing `kept` passthrough already
  included every kept name in `curated` unconditionally (see
  `scripts/corpus/selection.test.ts:378` and surrounding tests) — round 2 only
  had to change what `kept`/`quotas` select.ts passes in, not the pure
  selection algorithm.
- Updated `SELECTION_CRITERIA.note` to describe the sticky behavior instead
  of the stale "first four strata keep the first 40 picks unchanged" text.
- New test: "sticky quotas keep a previous pick that fresh competition would
  rank out" (`scripts/corpus/selection.test.ts`) — a kept name absent from the
  candidate pool entirely still appears in `curated` under `STICKY_QUOTAS`,
  and a 5-candidate form pool that would normally fill a 1-slot form quota
  contributes zero picks once quotas are frozen.
- Restored `compat/corpus.json` to the 60-entry list committed on `v3/restart`
  (the pre-round-1 state) before re-running selection, so "previous" means
  the orchestrator's intended baseline, not round 1's already-regenerated
  file.
- Re-ran `bun run corpus:select` (default `BLAST_CORPUS_MAX_MB`) — output:
  "80 curated extensions (768 scanned, 496 eligible); form 0, detail 0, utils
  0, list-only 0, grid 0, menu-bar 0, action-variants 0, selection-apis 0,
  shared-deps 20" — confirming all 60 previous picks survived unchanged (in
  original order) and only 20 new shared-deps names were added:
  keeper-security, bugmenot, ring-intercom, hevy, kaalam, laravel-artisan,
  humaans, time-until-i-do, saved-items, uk-bank-holidays, leetcode,
  workflowy-inbox, codepen, vocab-search, valkey-commands-search,
  duan-raycast-extension, parcel, keygen, hyrule-compendium-search,
  stockholm-public-transport.
- Re-ran `BLAST_CORPUS_MAX_MB=1200 bun run corpus:smoke` (same ~700 MB
  80-extension checkout with assets as round 1, over the 600 MB default) and
  committed the regenerated `compat/corpus.json`, `compat/smoke.json`,
  `compat/SMOKE.md` after `bun run fmt`. Deleted `.cache/raycast-extensions`
  afterwards; never ran `git ls-tree -l` or `git cat-file -s` on it.

Smoke outcome summary: 200 commands across the 80 curated extensions —
rendered 185, completed 2, capability-denied 7, bundle-failed 0, crashed 6,
network 0, timeout 0, unsupported-mode 0, unsupported-api 0.

Non-rendered commands and cause (0 are `unsupported-api`; none need a Blast
API stub):

| Command | Outcome | Cause |
| --- | --- | --- |
| `atomtick/copy-atomic-time` | capability-denied | `clipboard.copy` — denied by the headless deny-all broker (expected). |
| `google-maps-search/travelHome` | capability-denied | `open.url` — denied (expected). |
| `humaans/book-time` | capability-denied | `open.url` — denied (expected). |
| `humaans/me-time-away` | capability-denied | `open.url` — denied (expected). |
| `kaalam/now` | capability-denied | `clipboard.paste` — denied (expected). |
| `random-color/random-color` | capability-denied | `clipboard.copy` — denied (expected). |
| `text-decorator/decorate-text` | capability-denied | `command.launch` — denied (expected). |
| `google-maps-search/quickSearchMaps` | completed | `no-view` mode command completed without rendering a scene (expected shape for this mode). |
| `uk-bank-holidays/next-holiday` | completed | same `no-view` shape, expected. |
| `bugmenot/find-login` | crashed | `Cannot find package 'undici'` at runtime — a transitive import (likely via `node-fetch`/`cross-fetch`) Blast's bundler does not resolve or externalize. Possible Blast bundling gap; same root cause as the next row. |
| `valkey-commands-search/search-valkey-commands` | crashed | Same `Cannot find package 'undici'` runtime failure as `bugmenot/find-login`. Worth one follow-up task covering both. |
| `humaans/holidays` | crashed | `api key missing` — extension precondition; no Blast API gap, smoke has no real credentials. |
| `humaans/people` | crashed | `api key missing` — same precondition. |
| `parcel/my-deliveries` | crashed | `API key not found. Please add your Parcel API key in extension preferences.` — extension precondition, not a Blast gap. |
| `hyrule-compendium-search/getEntry` | crashed | `Cannot read properties of undefined (reading '$and')` — looks like a real bug (an undefined object where the extension expects a query/filter builder); worth a follow-up task to reproduce and classify before deciding whether it is a Blast gap or an extension issue exposed by a shared-dep major. |

Not done / risks:
- All 60 previously committed extensions (including the nine round 1 had
  dropped — appgrid, atomtick, clocky-time-tracker, donut, ego-lite,
  input-source-switcher, melanite-search, punch-clock, windows-domain — plus
  the other 51) are back and unchanged; verified programmatically that
  `curated[:60]` equals the restored `v3/restart` list in the same order and
  that the only growth is the 20 shared-deps names appended after it.
- `bun run corpus:smoke` still needs `BLAST_CORPUS_MAX_MB=1200` (default 600
  MB) for the 80-extension checkout with assets (~700 MB) — same as round 1;
  not changing the script default since that is a disk-budget policy call
  outside this task's scope.
- Did not investigate or fix the `undici` bundling gap or the
  `hyrule-compendium-search` crash — out of scope per the task; follow-up
  tasks should cover them.
- Did not add a `select.ts`-level test for the "fail loudly if a previously
  curated extension no longer exists at the pinned commit" path — that logic
  lives in the file-I/O entry point (`select.ts`), which this repo's
  deterministic/offline test policy does not cover directly (no fake git
  checkout harness exists); the pure-function stickiness behavior it relies
  on (`selectCurated`'s `kept` passthrough plus `STICKY_QUOTAS`) is covered
  in `selection.test.ts`.
```
