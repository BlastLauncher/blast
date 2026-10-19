---
id: "0050"
title: Smoke crash follow-ups — undici import and hyrule-compendium
status: doing
milestone: M3
depends: []
---

## Goal

The two smoke crashes that may be Blast bugs are explained and, where they
are Blast's fault, fixed: `Cannot find package 'undici'`
(`bugmenot/find-login`, `valkey-commands-search/search-valkey-commands`) and
`Cannot read properties of undefined (reading '$and')`
(`hyrule-compendium-search/getEntry`).

## Context

- Smoke results: `compat/SMOKE.md` / `compat/smoke.json` (task 0048).
  Reproduce one command at a time: `bun run corpus:fetch --extension <name>`
  then `bun run blast run .cache/raycast-extensions/extensions/<name>
  <command>` (sparse; never `git ls-tree -l`/`git cat-file -s`; delete
  `.cache/raycast-extensions` afterwards).
- `undici`: find who imports it (extension source, or a provided package's
  graph such as `node-fetch`/`cross-fetch`/`axios`). The bundling policy is
  `packages/host/src/bundle.ts` + `packages/host/src/dependencies.ts`
  (decision 0002). A runtime "Cannot find package" (not a bundle-time
  `MISSING_DEPENDENCY`) means something escaped the policy — likely a dynamic
  `import()`/`require` or an `external` leak; that is a Blast bug: the policy
  must either bundle it or fail at bundle time with `MISSING_DEPENDENCY`.
  Fix accordingly with a fixture test. Adding `undici` to the allowlist is
  allowed only if it is the extension's own declared dependency and fits the
  0037 rules (greedy rank, budget); otherwise fail clearly.
- `hyrule-compendium-search`: classify — Blast API behaviour difference,
  shared-dependency major mismatch (check the CLI warning), or an extension bug
  that also fails in Raycast without network/data. Fix only Blast causes, with
  a regression test; otherwise document the classification.
- Re-run `bun run corpus:smoke` only if a fix changes outcomes (it needs
  `BLAST_CORPUS_MAX_MB=1200` today; see task 0051) and commit the reports.

## Acceptance

- [ ] Each crash has a root cause in Handoff; Blast bugs fixed with tests.
- [ ] No runtime "Cannot find package" can occur for bare imports: either
      bundled or `MISSING_DEPENDENCY` at bundle time (test).
- [ ] `bun run verify` passes.

## Out of scope

- Extension-side API-key preconditions.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
