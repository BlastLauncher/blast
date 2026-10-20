---
id: "0067"
title: Generated JSON Schema for the embedder protocol + docs/embedding.md
status: doing
milestone: M5
depends: ["0066"]
---

## Goal

A non-JS embedder can generate types or validators from a checked-in JSON
Schema of the `blast serve` protocol and capability catalog. A short guide
shows both embedding surfaces end to end.

## Context

- Decisions `docs/decisions/0009` (point 5), `0010`, `0011`. Sources of truth:
  - `packages/protocol/src/embedder.ts`: message types and validators;
  - `packages/protocol/src/capabilities.ts`: `CAPABILITIES`, already
    JSON-Schema-like per capability;
  - `packages/protocol/src/messages.ts`: the `scene` and `log` messages the
    server forwards inside events.
- Add `scripts/protocol/generate-schema.ts`. It writes
  `packages/protocol/schema/embedder-v1.schema.json` (draft 2020-12) with:
  - `$defs` for every embedder message;
  - every request method's params and result;
  - every event;
  - `SceneMessage`/`SceneNode`/`LogMessage`;
  - one `$defs` entry per capability, `params` and `result` taken from
    `CAPABILITIES`.
    Write the schema description in a single exported structure in
    `packages/protocol/src/embedder-schema.ts`, next to the validators (no new
    dependencies). The script only serializes it with stable key order.
- Add `bun run protocol:schema` (write) and `bun run protocol:check`, which
  fails when the file is stale. Add `protocol:check` to
  `scripts/verify.ts` next to `compat` (as `protocol`).
- Add a test (`packages/protocol/src/embedder-schema.test.ts`) that validates
  real messages against the schema, with a tiny in-test validator covering
  only the keywords the schema uses:
  - sample `hello`, `welcome`, requests, responses and events;
  - one real scene from a fixture.
    It also checks that every method name in `embedder.ts` has a schema entry.
- Add `docs/embedding.md` (≤ 150 lines; add a line limit for it in
  `scripts/check-workflow.ts` `LINE_LIMITS`). Sections:
  1. what the engine is and is not (0009/0010);
  2. in-process: `createEngine`, `register`, `openExtension`, launch,
     scenes/events, `@blastlauncher/client-core` for view models,
     `@blastlauncher/native` opt-in;
  3. out-of-process: spawning `blast serve`, the handshake, a request/event
     transcript, capability forwarding;
  4. the capability catalog and how to implement a capability;
  5. the schema file and versioning rules.
     Link it from `docs/architecture.md` (one line). Be factual: describe only
     what exists in code today.

## Acceptance

- [ ] `bun run protocol:schema && git diff --exit-code` clean after commit;
      `bun run protocol:check` fails on a hand-edited schema (say in Handoff
      that you tried it).
- [ ] The schema test passes and fails when a method is added without schema.
- [ ] `docs/embedding.md` exists, is within its line limit, and every code
      identifier in it exists (`rg` each in Handoff).
- [ ] `bun run verify` passes, with a new `protocol ok` step.

## Out of scope

- Changing protocol behaviour, the Go example (0068), client-core over the
  wire, publishing.

Handoff:

```
Branch/commit: t3/protocol-schema-embedding-docs @ (filled by orchestrator merge)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 90.1s
Done:
  - `packages/protocol/src/embedder-schema.ts`: single exported structure
    (`EMBEDDER_PROTOCOL_SCHEMA`, draft 2020-12, small keyword set; $defs per
    embedder/server message, per-method `request.*`/`result.*`, all six
    events, scene/log/handler-ref shapes, `capabilities.*` from CAPABILITIES,
    capability.request variants pinning params per capability).
  - `scripts/protocol/generate-schema.ts` + `schema.ts` + `check-schema.ts`;
    `bun run protocol:schema` writes and `bun run protocol:check` fails when
    `packages/protocol/schema/embedder-v1.schema.json` is stale; `protocol`
    step added to `scripts/verify.ts`; generated file checked in, excluded
    from oxfmt via `.ignore` (oxfmt would otherwise reformat and desync it).
  - `packages/protocol/src/embedder-schema.test.ts`: in-test mini validator
    (type/properties/required/additionalProperties/items/enum/const/oneOf/
    anyOf/$ref) over the real transcript: hello/welcome/error, every method
    request+response, all events, capability request/result/progress/cancel,
    the hello-list fixture scene, plus the per-method/capability $def checks.
  - `fixtures/scenes/hello-list.json`: real scene captured with
    `bun run blast run fixtures/extensions/hello-list index --json`.
  - `docs/embedding.md` (130 lines), limit added in `scripts/check-workflow.ts`
    LINE_LIMITS, one-line link from `docs/architecture.md`.
  - `embedder.ts` gained no behavioural change: only the exported
    `EMBEDDER_METHODS` list; `index.ts` re-exports `EMBEDDER_PROTOCOL_SCHEMA`.
Acceptance: protocol:schema regenerates byte-identical (git diff clean);
    manual attempt at hand-editing the checked-in schema failed `protocol:check`
    with "stale; run bun run protocol:schema"; the extra-method case is
    exercised by `method: "extension.typo"` failing the request oneOf; every
    `docs/embedding.md` identifier was rg-verified in packages/docs.
Not done / risks: $defs keys use dots (`capabilities.clipboard.copy.name` has
    dots inside a key, fine) — but refs must never contain `/` inside a key
    (JSON-Pointer), documented by the test validator. Root oneOf cannot pair
    a response to its method, so per-method results validate against
    `result.*` defs directly (tested). EMBEDDER_METHODS is a new public export
    (mirrors the wire table; reviewer may want it unexported).
```

