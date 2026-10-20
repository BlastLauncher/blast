---
id: "0080"
title: "blast serve views: client-core controller over the embedder protocol"
status: doing
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

- [ ] Child-process tests above pass; existing serve tests unchanged.
- [ ] `bun run protocol:check` is clean after regeneration; schema tests cover
      `session.input` and `session.view`.
- [ ] `bun run verify` passes.

## Out of scope

- TUI migration (0079), form field editing, protocol v2.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
