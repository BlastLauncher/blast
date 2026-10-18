---
id: "0011"
title: Corpus fetch tool with pinned shallow sparse checkout and disk guard
status: review
milestone: M2
depends: []
---

## Goal

`bun run corpus:fetch` maintains a pinned, shallow, blobless, sparse checkout
of `raycast/extensions` in `.cache/raycast-extensions/` containing only what
is asked for, and refuses to grow past a disk budget.

## Context

- Pin: `compat/corpus.json` = `{ "repository":
  "https://github.com/raycast/extensions.git", "commit":
  "3b812d1e153a1862df29bc8ec34e170c728512ea", "curated": [...] }` with the
  ten curated extension names listed in `PLAN.md` (M2). Committed.
- Clone recipe (measured: ~5 MB for the clone, ~52 MB with all manifests):
  `git clone --depth=1 --filter=blob:none --no-checkout --sparse`, then fetch
  and check out the pinned commit (`git fetch --depth=1 origin <commit>` and
  `git checkout <commit>`), and `git sparse-checkout set --no-cone` with
  patterns. Default patterns: `/extensions/*/package.json`.
- `corpus:fetch --extension <name>` (repeatable) and `--curated` add
  `/extensions/<name>/` for those extensions (whole directory, so assets
  exist) but exclude any `node_modules/`.
- **Never** run `git ls-tree -l`, `git cat-file -s`, or anything that needs
  blob sizes across the repo: on a blobless clone that downloads every blob
  (this happened once and pulled 660 MB). Never `npm install`.
- Disk guard: after each operation measure `.cache/raycast-extensions`;
  above `BLAST_CORPUS_MAX_MB` (default 600) abort with a clear message.
- Code in `scripts/corpus/`. Pure helpers (pattern building, pin validation,
  name validation — extension names must match `^[a-z0-9][a-z0-9-]*$`) are
  unit-tested; git operations live in a thin entry and are not run by
  `bun test` (no network in tests).
- Add `corpus:fetch` to `package.json` scripts.

## Acceptance

- [ ] Unit tests for pattern building, pin validation, name validation and
      the disk-guard decision function.
- [ ] Manual run documented in Handoff: fresh `bun run corpus:fetch --curated`
      → sizes of `.git` and checkout, number of manifests, and that each
      curated extension has `package.json` and `src/`.
- [ ] Re-running is idempotent and does not grow the cache meaningfully.
- [ ] `bun run verify` passes.

## Out of scope

- Scanning source (0012), bundling (0013), running commands (0014).

## Handoff

```
Branch/commit: t3/corpus-fetch @ 7a3ec4e (implementation); this handoff is the next commit
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 10.8s
Done:
- compat/corpus.json pins https://github.com/raycast/extensions.git at
  3b812d1e153a1862df29bc8ec34e170c728512ea with the ten curated names from PLAN.md.
- scripts/corpus/corpus.ts: offline helpers — parsePin/readPin (non-empty
  repository, 40 lowercase hex commit, non-empty curated list of names matching
  ^[a-z0-9][a-z0-9-]*$ and free of duplicates), isValidExtensionName,
  buildPatterns, parseArgs, checkDiskBudget, maxMbFromEnv (BLAST_CORPUS_MAX_MB,
  default 600), megabytes, directoryBytes.
- scripts/corpus/fetch.ts: the only file that runs git — clone --depth=1
  --filter=blob:none --no-checkout --sparse, fetch --depth=1 origin <pin>,
  sparse-checkout set --no-cone <patterns>, checkout <pin>, then asserts
  HEAD == pin. The disk guard measures after every step and exits 1 above the
  budget. No blob sizes are ever requested; nothing npm-installs.
- 12 tests in scripts/corpus/corpus.test.ts cover pattern building, pin
  validation, name validation, the budget/env decisions, directoryBytes and
  parseArgs. The git steps are deliberately not run by `bun test` (no network).
- Manual fresh run (`rm -rf .cache/raycast-extensions && bun run corpus:fetch
  --curated`, ~13 s): clone 4.9 MB → fetch 4.9 MB → sparse-checkout 4.9 MB →
  checkout 103 MB (apparent, files only). On disk: 125 MB total by `du`, `.git`
  56,746 KB and `extensions/` 62,776 KB apparent; 3443 `package.json`
  manifests; all ten curated extensions have `package.json` and `src/`; no
  `node_modules` anywhere; HEAD = the pin.
- Idempotent: a second `--curated` run took 2.7 s with 0 byte growth, the same
  file count, and a clean `git status --porcelain`. `--extension radix` switched
  the sparse set to the manifest pattern plus radix's whole directory (67 MB)
  and dropped the other curated trees. `BLAST_CORPUS_MAX_MB=1` aborted with
  exit 1 and `corpus: fetch: 103 MB is above BLAST_CORPUS_MAX_MB=1 MB; delete
  .cache/raycast-extensions or raise the budget`; `BLAST_CORPUS_MAX_MB=big`
  aborted on the invalid value.
- .cache/raycast-extensions and the scratch clones under /tmp/opencode were
  deleted after measuring; the worktree's only changes are the corpus files.
Not done / risks:
- The fetch step runs on every invocation. A `rev-parse`/`cat-file` presence
  probe is not usable: on a partial clone git lazily fetches the missing object
  it is asked about, so the probe would silently do the fetch and hide its
  guard line. Cost is one ~1 s round trip per run.
- directoryBytes sums regular-file sizes (no directory inodes, no block
  rounding), so the guard under-reports against `du` (103 MB vs 125 MB). The
  guard also aborts after the step that exceeded the budget, not before, so a
  future too-broad pattern still downloads before it is caught.
- During measurement the clone's depth-1 tip equaled the pin, so the "pin is
  older than the tip" path was exercised only in a scratch clone under
  /tmp/opencode: explicit `git fetch --depth=1 origin <older-sha>` +
  `sparse-checkout set --no-cone ...` + `checkout <older-sha>` worked (3443
  manifests, 111 MB). The pinned run itself never needed that path.
- fetch.ts has no automated test by design (network); its behaviour is covered
  only by the manual runs above.
- Extra flag not asked for: `--extension=<name>` is accepted as well as
  `--extension <name>`.
- For 0012: the reusable helpers (CORPUS_DIR, buildPatterns, parsePin) are
  exported from scripts/corpus/corpus.ts.
```
