---
id: "0046"
title: AI.ask with extension models, refreshModels, experimental_decide
status: doing
milestone: M3
depends: ["0045"]
---

## Goal

`AI.ask(prompt, { model: { id } })` answers from the calling extension's own
model provider (task 0045), `AI.refreshModels()` re-reads its models, and
`AI.experimental_decide` works through a deny-by-default capability with a
headless answer. No non-deprecated `AI*` path remains missing.

## Context

- `packages/runtime/src/api/ai-browser.ts` currently rejects `{ id }`
  models. Route them via capability `ai.ask` with the model id; the host
  answers from a provider session of the same extension (started lazily,
  reused within the command session, shut down with it) — own-extension
  providers need no grant. Build the request as Raycast documents
  (`messages: [{ role: "user", content: prompt }]`, creativity → temperature
  mapping: decide and document). Stream text deltas back so `on("data")`
  fires per chunk — extend the capability flow or add a progress message;
  keep the protocol change minimal and update decision 0006.
- `AI.refreshModels()` → capability `ai.models.refresh`; host re-calls
  `getModels` on the provider session (no-op if the extension has none).
- `AI.experimental_decide({ state, questions }, { signal })` → capability
  `ai.decide`; validate the host answer against each question type (read
  `DecisionQuestion`/`DecisionAnswer` and the Noul/Score/Choice types in the
  declarations). Headless: `--ai-decide <file.json>` supplies answers; else
  denied. `environment.canAccess(AI)` semantics stay as in task 0043.
- Host API from 0045: `packages/host/src/provider.ts` (`startModelProvider`,
  `getModels`, `stream`); fixture `fixtures/extensions/model-provider`.
- CLI e2e on the 0045 fixture; docs in `docs/cli.md` and architecture.

## Acceptance

- [x] Runtime/host tests: own-provider ask (chunks, abort, unknown id),
      refreshModels, decide (valid, invalid answer, denied).
- [x] CLI e2e; no non-deprecated `AI*` path missing.
- [x] `bun run verify` passes.

## Out of scope

- Other extensions' providers; real hosted models.

## Handoff

```
Branch/commit: t3/fix-ai-ask-routing @ 9d4cb9e (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 63.9s
Done:
- Routed own-extension AI.ask through a lazy, reused provider child; streamed text,
  propagated aborts, refreshed models and shut the provider down with the command.
- Implemented typed experimental_decide with state serialization, question/answer
  validation, abort handling and deny-by-default --ai-decide JSON answers.
- Fixed readonly score criteria serialization without any; projected provider
  models before serialization, including non-JSON private metadata, while keeping
  host validation strict. Added rejection coverage for malformed declared fields.
- Runtime/host/protocol focused checks: 20 pass; CLI ask/decide and pagination
  checks: 2 pass. Full verify: 448 pass, 0 fail. Regenerated compat: no missing
  non-deprecated AI paths; documented protocol, creativity mapping and CLI usage.
Not done / risks:
- Fast-forward from round 2 was impossible because this worktree already included
  task 0044. Cherry-picked 57b94b6 and 526eab4, preserved 0044, and regenerated
  conflicting compat files. Trimmed redundant architecture status text to meet
  its line limit. No integration merge, push or new dependencies.
- Real hosted models and other extensions' providers remain out of scope.
```
