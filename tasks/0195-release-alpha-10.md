---
id: "0195"
title: Release 3.0.0-alpha.10 and move npm latest to v3
status: doing
milestone: M17
depends: []
---

## Goal

`3.0.0-alpha.10` (embedder protocol 2) is published, `latest` points at it on
every `@blastlauncher/*` package, and the docs say so.

## Context

- Already done outside the repo: the v3 prerelease workflow published all ten
  packages under `next` (run 45916528368, tag `v3.0.0-alpha.10`, GitHub
  prerelease), and an owner moved `latest` to `3.0.0-alpha.10` on all ten,
  including `cli` and `runtime`, which were on v1 `1.0.5`.
- The workflow cannot move `latest`: trusted publishing only publishes.
- Docs that still describe the old state: `docs/release.md` (latest stays on
  v1), `README.md` and `docs/embedding.md` (alpha.9, "not latest"),
  `docs/quickstart.md` ("use `@next`, not `latest`").

## Acceptance

- [ ] No doc claims `latest` is Blast v1 or that installs must avoid `latest`:
      `git grep -n -i 'not .latest\|stays on Blast v1\|still points at'` is empty.
- [ ] `docs/release.md` says how `latest` is moved after a tagged prerelease.
- [ ] `PLAN.md` ticks 0195 and logs the decision.
- [ ] `bun run verify` passes.

## Out of scope

- Code changes, workflow changes, further releases.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
