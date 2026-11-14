---
id: "0173"
title: Upgrade the coverage denominator to @raycast/api 2.11.1
status: doing
milestone: M10
depends: []
---

## Goal

`compat/` measures against the latest `@raycast/api` (2.11.1), as AGENTS.md
requires, and issue #89 can be closed.

## Context

- The weekly job vendored 2.11.1 on branch `origin/compat/raycast-api-2.11.1`
  (one commit, `f0f24d8`) and opened issue #89. `main` still reports 2.10.1.
- AGENTS.md "Raycast API coverage": upgrading = `compat:fetch` →
  `compat:inventory` → `compat:report` (`bun run compat:upgrade` wraps it),
  then review the inventory diff. Regenerate on top of current `main`
  rather than merging the old branch, if that is simpler; never hand-edit
  `compat/`.
- New or changed symbols: if any are now missing, add `// @covers` evidence
  where Blast already implements them, or the `compat:stubs` stub where it
  does not; list each one in Handoff. Do not implement new APIs here; a
  missing one becomes a follow-up line in Handoff.

## Acceptance

- [ ] `compat/COVERAGE.md` says `@raycast/api@2.11.1`; Handoff lists the
      inventory diff (added/removed/changed symbols) and the new coverage
      numbers.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing new API surface; closing the GitHub issue (the orchestrator does).

## Handoff

```
Branch/commit: t3/update-raycast-api-2-11-1 @ 19d2ec7
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 232.9s
Done: Regenerated compat/ against @raycast/api 2.11.1 with bun run compat:upgrade 2.11.1 (fetch -> inventory -> enums -> stubs -> report); no hand edits, no stubs changed.
  Inventory diff vs 2.10.1: added AI.Model.OpenAI_GPT-6.1_Terra ("openai-gpt-6.1-terra") and
  AI.Model.Vercel_Kimi_K3.1_Pro ("gateway-moonshotai/kimi-k3.1-pro") — both kind enum-member,
  non-deprecated; removed none; changed none; no new namespaces/interfaces/functions/properties.
  compat:enums carried both members into packages/runtime/src/api/enums.generated.ts and the
  generated @covers test, so both are covered with no manual tags and no compat:stubs stubs.
  Coverage now: non-deprecated 1539/1540 covered (99.9%), 1 partial, 0 missing; deprecated
  942/942 covered; all 2481/2482. Before: non-deprecated 1537/1538, deprecated 942/942, all 2479/2480.
  The single partial is the pre-existing BrowserExtension.getContent, unchanged by this upgrade.
Not done / risks: No new API surface implemented (out of scope). Regenerating the enum tables means
  the two new AI model ids are now known to Blast's runtime, but they are untested against a real
  gateway; no other follow-up needed. Anything else that changes in 2.11.1 relative to 2.10.1 is
  outside these declarations' coverage and not investigated.
```
