---
id: "0011"
title: Corpus fetch tool with pinned shallow sparse checkout and disk guard
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
