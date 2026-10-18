---
id: "0046"
title: AI.ask with extension models, refreshModels, experimental_decide
status: todo
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
- CLI e2e on the 0045 fixture; docs in `docs/cli.md` and architecture.

## Acceptance

- [ ] Runtime/host tests: own-provider ask (chunks, abort, unknown id),
      refreshModels, decide (valid, invalid answer, denied).
- [ ] CLI e2e; no non-deprecated `AI*` path missing.
- [ ] `bun run verify` passes.

## Out of scope

- Other extensions' providers; real hosted models.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
