---
id: "0152"
title: Condense decision records into a few current-state records
status: doing
milestone: M9
depends: []
---

## Goal

`docs/decisions/` holds only the rules that still bind today's code, in at
most 7 records and ≤ 330 lines in total (from 13 records, 675 lines), so
agents that read it before every task get current rules, not history.

## Context

- Today: 0001–0013 plus the new 0014 (`0014-thin-embedders.md`, leave it
  unchanged). Many records amend or supersede each other (0002 → 0008 → 0012;
  0007 is mostly replaced by 0009; 0003/0004/0005 describe scene conventions
  already in `docs/architecture.md` "Scene conventions").
- Suggested shape (adjust if the content says otherwise):
  - 0001 process, protocol and scene model (absorb 0003, 0004, 0005 rules
    that are not already in architecture.md);
  - 0002 extension dependencies (merge 0002, 0008, 0012 into the current policy);
  - 0006 model provider sessions (trim);
  - 0009 embeddable engine (absorb 0007's surviving points: TUI is a reference
    client on Bun, desktop deferred);
  - 0010 pluggable native capabilities;
  - 0011 embedder protocol;
  - 0013 browser runtime; 0014 untouched.
- Keep the surviving file numbers so existing references stay valid. Merged
  records are deleted; each survivor's Status line lists what it absorbed
  (e.g. `accepted 2026-10-18; absorbs 0003–0005`). No history narrative,
  no "why we changed our mind"; keep a short Why per record.
- References to deleted records exist in `README.md`, `PLAN.md` decision log,
  `docs/*.md`, `packages/protocol/src/{framing,messages}.ts`,
  `packages/host/src/{storage,bundle}.ts`, `scripts/check-workflow.test.ts`,
  `examples/**`. Repoint every one (`grep -rn "000[2-9]\|001[0-3]"` on
  decision mentions; skip `compat/` and `.cache/`).
- Every rule a current test or code path relies on must survive. Before
  deleting a record, check its numbered points against the code; drop only
  points that the code no longer does (say which in Handoff).

## Acceptance

- [ ] `ls docs/decisions | wc -l` ≤ 7 and `cat docs/decisions/*.md | wc -l` ≤ 330.
- [ ] `grep -rnE "decisions/00(03|04|05|07|08|12)|\b(0003|0004|0005|0007|0008|0012)\b \(|decision 00(03|04|05|07|08|12)"`
      over the repo (excluding `compat/`, `.cache/`, `node_modules`, git history) prints nothing,
      or only task ids / unrelated numbers explained in Handoff.
- [ ] Handoff lists each deleted record and where each of its live rules went.
- [ ] `bun run verify` passes.

## Out of scope

- Changing any rule or code behaviour; editing `0014`, `AGENTS.md`, README
  prose beyond link fixes, `docs/embedding.md` beyond link fixes.

## Handoff

```
Branch/commit:
Verify: `bun run verify` passes all functional gates; the baseline format check remains red on unrelated pre-existing files `docs/decisions/0014-thin-embedders.md`, `tasks/0153-product-story-docs.md`, and `tasks/0157-launch-prompts-as-views.md`.
Done:
- Kept seven current-state records: 0001, 0002, 0006, 0009, 0010, 0013, and untouched 0014.
- Folded navigation, feedback, and menu-bar rules from 0003–0005 into 0001.
- Folded installed-dependency and launch-preflight rules from 0008 and 0012 into 0002.
- Folded the surviving terminal-client and embedder-wire rules from 0007 and 0011 into 0009.
- Repointed live references in README, architecture/docs, packages, examples, and scripts; PLAN and AGENTS remain for the orchestrator because workers must not edit them.
Not done / risks: The verification baseline has an unrelated formatting failure; no product behavior was changed. Remaining decision-number mentions in PLAN/AGENTS are orchestrator-owned references; the task file intentionally documents deleted ids. Deleted-record rules dropped as historical detail: 0003–0005 prose repetition and consequences, 0007's superseded MyGo plan, and 0011's standalone protocol narrative; their live rules are retained in the survivor records above.
```
