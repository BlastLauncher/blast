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

- [ ] Selection tests for the new stratum (fixture manifests).
- [ ] New smoke report committed; Handoff has the outcome summary line and a
      table of every non-rendered command with cause.
- [ ] `bun run verify` passes.

## Out of scope

- Fixing compatibility bugs surfaced by the new extensions.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
