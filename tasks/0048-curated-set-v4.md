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
Branch/commit: t3/fca1ba7b @ (see commit that adds this Handoff)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 73.8s
Done:
- Added the "shared-deps" `FeatureStratum` (quota 20) to `scripts/corpus/selection.ts`:
  `sharedPackagesOf`/`SHARED_DEPENDENCY_PACKAGES` (new in `imports.ts`) tag an
  extension that imports a shared allowlist package beyond @raycast/api,
  @raycast/utils and react; `Candidate` gained `sharedPackages` and
  `sharedMajorMatch` (via `dependencyWarnings`); `selectCurated` picks the
  stratum with a dedicated `pickSharedDeps` that round-robins across the first
  shared package each candidate imports and prefers a matching declared major
  within a package group, recorded in `SELECTION_CRITERIA.featureStrata["shared-deps"]`.
  Every other stratum's pick order is unchanged (`pickInRankOrder` is the same
  logic the loop always ran).
- `select.ts` now threads each manifest's `dependencies` through to
  `analyzeSources` so `sharedMajorMatch` can be computed for the real corpus.
- Added a "network" smoke outcome (`scripts/corpus/smoke.ts`): an `exit`
  probe whose error message matches a DNS/connect/fetch-failure signature
  (ENOTFOUND, ECONNREFUSED, ECONNRESET, EAI_AGAIN, ETIMEDOUT, getaddrinfo,
  "fetch failed", NetworkError) is now its own outcome instead of "crashed";
  capability-denied and unsupported-* checks still take priority.
- Tests: `scripts/corpus/imports.test.ts` (SHARED_DEPENDENCY_PACKAGES),
  `scripts/corpus/selection.test.ts` (shared-deps tagging, analyzeSources with
  a dependencies arg and major-mismatch, the round-robin/major-match pick
  order, the single-group fallback, and every pre-existing exact-shape
  assertion updated for the new stratum/outcome), `scripts/corpus/smoke.test.ts`
  (network classification, including that a capability denial wins over a
  network-shaped message).
- Ran `bun run corpus:select` (`BLAST_CORPUS_MAX_MB` default; 80 curated
  extensions: the kept 10 + 10/10/10 form/detail/utils + 5 each of
  grid/menu-bar/action-variants/selection-apis + 20 shared-deps) then
  `BLAST_CORPUS_MAX_MB=1200 bun run corpus:smoke` (the curated checkout alone
  is ~700 MB with assets, over the 600 MB default budget — needed a higher
  budget for this one run; nothing is committed that depends on it) and
  committed the regenerated `compat/corpus.json`, `compat/smoke.json`,
  `compat/SMOKE.md` after `bun run fmt`. Deleted `.cache/raycast-extensions`
  afterwards; never ran `git ls-tree -l` or `git cat-file -s` on it.

Smoke outcome summary: 207 commands across the 80 curated extensions —
rendered 187, completed 2, capability-denied 12, bundle-failed 0, crashed 6,
network 0, timeout 0, unsupported-mode 0, unsupported-api 0.

Non-rendered commands and cause (0 are `unsupported-api`; none need a Blast
API stub):

| Command | Outcome | Cause |
| --- | --- | --- |
| `advanced-replace/quick-slot-1..6` (6 commands) | capability-denied | `storage.get` — reads LocalStorage at startup; denied by the headless deny-all broker (expected, same as prior smoke runs). |
| `google-maps-search/travelHome` | capability-denied | `open.url` — opens a URL; denied (expected). |
| `humaans/book-time` | capability-denied | `open.url` — denied (expected). |
| `humaans/me-time-away` | capability-denied | `open.url` — denied (expected). |
| `kaalam/now` | capability-denied | `clipboard.paste` — denied (expected). |
| `random-color/random-color` | capability-denied | `clipboard.copy` — denied (expected). |
| `text-decorator/decorate-text` | capability-denied | `command.launch` — denied (expected). |
| `bugmenot/find-login` | crashed | `Cannot find package 'undici'` at runtime — a transitive import (likely via `node-fetch`/`cross-fetch`) that Blast's bundler does not resolve or externalize. Possible Blast bug (bundling gap); same root cause as the next row. |
| `valkey-commands-search/search-valkey-commands` | crashed | Same `Cannot find package 'undici'` runtime failure as `bugmenot/find-login`. Worth one follow-up task covering both. |
| `humaans/holidays` | crashed | `api key missing` — the extension's own precondition; no Blast API gap, smoke has no real credentials. |
| `humaans/people` | crashed | `api key missing` — same precondition as `humaans/holidays`. |
| `parcel/my-deliveries` | crashed | `API key not found. Please add your Parcel API key in extension preferences.` — extension precondition, not a Blast gap. |
| `hyrule-compendium-search/getEntry` | crashed | `Cannot read properties of undefined (reading '$and')` — looks like a real bug (an undefined object where the extension expects a query/filter builder); worth a follow-up task to reproduce and classify before deciding whether it is a Blast gap or an extension issue exposed by a shared-dep major. |

Not done / risks:
- The non-"shared-deps" strata (detail, utils, menu-bar, action-variants,
  selection-apis) also picked different extensions than the previously
  committed `compat/corpus.json` — not because this task's logic reclassifies
  old picks (the additive-stratum mechanism is unchanged and verified not to
  move earlier picks within one run), but because `compat/corpus.json` was
  last regenerated at task 0033, *before* task 0037 expanded
  `PROVIDED_PACKAGES` from 2 entries to 16. Candidates that declare
  axios/lodash/etc. were rejected as "unprovided dependencies" back then and
  are eligible now, so running the (unchanged) selector against the current
  allowlist for the first time shifts some pre-0037 picks too (e.g.
  `atomtick`, `donut`, `clocky-time-tracker`, `punch-clock`, `appgrid`,
  `melanite-search`, `ego-lite`, `windows-domain`, `input-source-switcher`
  dropped out; `superwhisper`, `xiaohe-query`, `amazon-search`,
  `icloud-global-pricing-comparison`, `codex-reset-forecast`,
  `tinkerer-club`, `advanced-replace`, `leetcode`, `codepen` came in). This is
  a one-time correction, not new instability — a second `corpus:select` run
  reproduces the same file. Flagging it since the diff is larger than "~20
  new extensions."
- The "network" outcome exists and is tested in `smoke.test.ts`, but this
  particular run produced 0 of them: the selector's no-network preference and
  the extensions that do reach a network mostly fail earlier on a missing
  preference/API key ("api key missing") rather than a DNS/connect error, so
  the new classification is unexercised by live data this round. Left as
  dead-but-tested code rather than removed, since a future shared-deps batch
  (axios/node-fetch extensions especially) is likely to hit it.
- `bun run corpus:smoke` needed `BLAST_CORPUS_MAX_MB=1200` (default 600 MB) —
  the 80-extension curated checkout with assets is ~700 MB. Not changing the
  script default since that is a disk-budget policy call, not part of this
  task's scope; flagging it so a future curated-set task does not get stuck
  on the same guard.
- Did not investigate or fix the `undici` bundling gap or the
  `hyrule-compendium-search` crash — out of scope per the task; follow-up
  tasks should cover them.
```
