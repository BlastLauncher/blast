---
id: "0080"
title: "blast serve views: client-core controller over the embedder protocol"
status: review
milestone: M5
depends: ["0078"]
---

## Goal

A non-JS embedder can opt into server-side view models. Per session,
`blast serve` runs `@blastlauncher/client-core`'s controller, emits
`session.view` events with the JSON view model, and accepts semantic inputs.
The embedder then only draws and forwards keys. Raycast semantics (ranking,
selection, action panel, shortcuts, throttle, HUD timing, pagination) need
no reimplementation in Go or Swift.

## Context

- Decisions `docs/decisions/0011` (embedder protocol v1) and `0009` point 4.
- Controller: `packages/client-core/src/controller.ts`:
  `createController({ platform, hudDurationMs? })`, `scene`, `input`,
  `tick`, `view`, `subscribe`. Results return `{ events, effects }`, where
  effects are `quit` or `schedule { ms, token }`.
- Protocol additions (additive, still version 1; record them in 0011 with a
  short "Views" point, keeping it ≤ 60 lines):
  - `extension.launch` params gain `views?: { platform: "macOS"|"Windows"|"Linux" }`.
    When present, the server creates a controller for the session.
  - New request `session.input { session, input: ControllerInput }` →
    `null`. The server applies it, sends resulting events to the runtime
    (`sendEvent`), schedules `tick` for `schedule` effects with real timers,
    and closes the session on `quit`.
  - New event `session.view { session, view: ControllerView }` after every
    change, deduplicated when the JSON is unchanged. Scenes still flow as
    `session.scene`.
  - Without `views`, nothing changes.
- Types and validators: extend `packages/protocol/src/embedder.ts`. Keep
  `protocol` dependency-free; it must not import client-core. Describe
  `ControllerInput` structurally in protocol (a union validator) and
  `ControllerView` as an opaque JSON object in the schema, with a `$comment`
  pointing at client-core. Regenerate the schema (`bun run protocol:schema`)
  and extend `embedder-schema.ts`/tests accordingly.
- `packages/serve` depends on `@blastlauncher/client-core`. Release build:
  check `scripts/release/build.ts` handles the new dependency (it should
  already, as client-core is released).
- Tests in `packages/serve/src/*.test.ts` (child process):
  - launch with views gives a `session.view` with list rows;
  - `session.input {type:"search"}` gives a ranked view;
  - `primary` gives the runtime event, then a new scene, then a new view;
  - a throttled search fires once after its delay;
  - `quit` closes the session.
- Update `docs/embedding.md`: a "Views" subsection, ≤ 15 lines with a
  transcript. Update `examples/go-embedder` only if trivial (optional; Go
  tests are not in verify). If you change it, run `bun run example:go`.

## Acceptance

- [x] Child-process tests above pass; existing serve tests unchanged.
- [x] `bun run protocol:check` is clean after regeneration; schema tests cover
      `session.input` and `session.view`.
- [x] `bun run verify` passes.

## Out of scope

- TUI migration (0079), form field editing, protocol v2.

## Handoff

```
Branch/commit: t3/c20ec77c @ 31841b64e1adfc34c63b1ab9de8ab3f050db34bc
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 118.9s
Done:
- Merged round-1 work (t3/serve-views @ ad9ba69): ControllerInput/ControllerView
  protocol types and validators in `embedder.ts`, schema regen in
  `embedder-schema.ts`/`embedder-v1.schema.json`, `blast serve` controller
  wiring (`extension.launch` views option, `session.input`, `session.view`,
  timer effects, quit-closes-session) in `packages/serve/src/main.ts`.
- Fixed a `--deny-warnings` lint failure (oxlint unicorn/consistent-function-scoping)
  by hoisting a test helper to module scope in `embedder-schema.test.ts`.
- Trimmed `docs/embedding.md` (and unrelated adjacent prose) by a few lines so
  the new "Views" subsection fits the file's 150-line workflow limit; the
  check counts `content.split("\n").length`, i.e. one more than `wc -l` for a
  file with a trailing newline, so the real budget is 149 by `wc -l`.
- Verified the two new `packages/serve/src/main.test.ts` tests jointly cover
  all five Acceptance scenarios (views launch → ranked list rows, throttled
  search firing once, primary → scene → view, quit via `back`, and views-off
  sessions rejecting `session.input`), plus bonus coverage for view-JSON
  dedup and discarding a pending throttle timer on session.close.
- Set this task's status to `review` and checked off its Acceptance items;
  left `PLAN.md` untouched (Orchestrator ticks it at merge, per AGENTS.md
  Worker role boundary).
Not done / risks:
- `examples/go-embedder` was not updated (task marked it optional/trivial-only;
  Go tests are not part of `verify` so this is unverified either way).
- Did not touch `docs/decisions/0011-embedder-protocol.md` beyond what
  round-1 already wrote; its new point 9 and Consequences edit read correctly
  and the file is well under the 60-line decision limit (57 by `wc -l`).
- Branch is unpushed per instructions; Orchestrator still needs to merge into
  `v3/restart`/`main`, delete this task file, tick `PLAN.md`, and push.
```

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
