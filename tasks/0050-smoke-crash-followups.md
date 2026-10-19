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

- [x] Each crash has a root cause in Handoff; Blast bugs fixed with tests.
- [x] No runtime "Cannot find package" can occur for bare imports: either
      bundled or `MISSING_DEPENDENCY` at bundle time (test).
- [x] `bun run verify` passes.

## Out of scope

- Extension-side API-key preconditions.

## Handoff

```
Branch/commit: t3/smoke-crash-followups @ db284f35167a27e7db7a292e7a056922e683807d
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 82.7s
Done:
- Fixed Bun's undici/ws built-in classification leaking npm imports into Node bundles.
- Checked emitted external imports and added offline Node execution / missing-dependency regressions.
- Classified missing launch arguments before smoke execution; added tests and regenerated reports.
Not done / risks: Required-argument commands are not exercised by the default smoke run.
```

Root causes and evidence:

- Both `bugmenot/find-login` and `valkey-commands-search/search-valkey-commands`
  import Cheerio; provided `cheerio@1.2.0` statically imports its private
  transitive dependency `undici`. Bun's `node:module.isBuiltin("undici")`
  returns true while Node's returns false. The Bun-driven smoke bundler
  therefore incorrectly externalized undici. Bundling now uses Node's built-in
  list, keeps undici private in Cheerio's graph, and checks emitted external
  imports. No dependency or allowlist additions. The Cheerio fixture bundles
  under Bun and executes offline in Node; direct static imports, literal dynamic
  imports and static requires of unprovided Bun built-ins fail at bundle time.
  Optional requires in provided graphs retain their existing guarded handling.
- `hyrule-compendium-search/getEntry` declares required `entryName`, but smoke
  supplied no arguments. Its component calls `fuse.search(undefined)`;
  standalone `fuse.js@7.5.0` reproduces the exact `$and` error offline and
  `search("apple")` returns `apple`. Its declared `^7.0.0` accepts that version.
  This was an invalid smoke invocation, not a Raycast API or Fuse major mismatch.
  Smoke now reports `missing-arguments` without launching these commands.
  The CLI already rejects absent entryName with exit 2. Supplying
  `--argument entryName=apple` reached the Detail loading scene; full completion
  was not established (a later `directory` error occurred, with the existing
  shared `@raycast/utils` 1.x/2.x major-mismatch warning). That separate issue
  was not the reported `$and` crash and remains outside this fix.
- Focused tests: dependencies 7 pass / 0 fail; smoke classification 21 pass /
  0 fail. Full verify: 485 pass / 0 fail. Regenerated via
  `BLAST_CORPUS_MAX_MB=1200 bun run corpus:smoke`: 200 commands, 184 rendered,
  1 completed, 7 capability-denied, 5 missing-arguments, 3 API-key crashes,
  0 bundle failures / unsupported APIs. Both former undici crashes render.
  Removed `.cache/raycast-extensions` afterwards. No extension source changed
  or redistributed; no push performed.
