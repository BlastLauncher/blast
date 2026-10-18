---
id: "0045"
title: AI model provider entrypoint (protocol + host + CLI)
status: review
milestone: M3
depends: ["0043"]
---

## Goal

An extension that declares an AI model provider can be loaded by Blast: the
host can list its models (`getModels`) and stream a completion
(`streamCompletion`) from it in a runtime child process, and the debug CLI
exposes both. All `AI.RegisteredModel*`, `AI.GetModels`,
`AI.StreamCompletion` and `AI.Model{Message,MessageContent,Tool,ToolSet,
ProviderOptions,Request,TextStream,StreamPart,FullStream,Stream}*` paths get
evidence.

## Context

- 14 corpus extensions use `AI.GetModels`/`AI.StreamCompletion`. Find the
  manifest shape first: `ai.modelProvider` is referenced in
  `compat/raycast-api/index.d.ts` (~521); read the provider types (~859 in
  the `AI` namespace, `ExtensionModel*` declarations ~2900–3200). Then fetch
  one or two such extensions with `bun run corpus:fetch --extension <name>`
  (find names by grepping manifests after a manifests-only fetch — never
  `git ls-tree -l`/`cat-file -s`; delete `.cache/raycast-extensions` after)
  to confirm the manifest field and export style. Record the shape in the
  decision record.
- Process model: the provider runs in its own runtime child, like a command
  (decision 0001). Add an `init.command.mode` value (e.g. `model-provider`)
  or a separate entry kind — choose, and write `docs/decisions/0006-*.md`
  (≤ 60 lines): messages for host→runtime `provider.getModels` /
  `provider.stream { id, model, request }` and runtime→host
  `provider.models`, `provider.part { id, part }`, `provider.end { id }`,
  `provider.error { id, error }`, plus abort. Stream parts are the declared
  `ModelStreamPart` union as JSON; `textStream` (ReadableStream or
  AsyncIterable of strings) maps to `text-delta` parts. Icons follow the
  image serialization from task 0040. Non-JSON values (`Uint8Array`, `URL`)
  in requests are encoded explicitly — document how.
- Protocol package: types + validation + tests. Host: bundling the provider
  entry (same dependency policy), a `startModelProvider(...)` session API
  with `getModels()` and `stream(model, request, { signal })` returning an
  async iterable of parts. Runtime: provider mode that imports the bundle and
  calls the named exports; no React scene.
- CLI: `blast models <extensionDir>` prints models (id, title, capabilities)
  and `blast complete <extensionDir> <modelId> <prompt>` prints text deltas
  and the finish part; documented in `--help` and `docs/cli.md`.
- Fixture extension under `fixtures/extensions/` with a provider that
  returns two models and streams deterministic text (both `textStream` and
  `fullStream` forms); no network.
- `@covers` (type paths get typed test evidence), `compat:report`, `fmt`.

## Acceptance

- [x] Decision 0006 written; protocol tests for every new message.
- [x] Host/runtime tests: getModels, streaming both forms, abort, provider
      throwing, missing exports.
- [x] CLI e2e for `models` and `complete` on the fixture.
- [x] Every path listed in Goal covered or explained in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Routing `AI.ask({ id })`, `AI.refreshModels`, `AI.experimental_decide`
  (task 0046). Real network models.

## Handoff

Branch/commit: `t3/ai-model-providers` @ `fcfc7e801a5d2203c95df9fb2fb6b1be3d7f6a05`
(implementation; the following commit records this handoff).

Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 67.4s`
— 405 tests, 0 failures, seed 1961213838.

Done:

- Decision 0006 records Groq/LM Studio manifest/export evidence, provider-mode
  lifecycle, request IDs, abort and attachment wire encoding. Corpus checkout deleted.
- Protocol types and validators cover every provider message and declared stream
  part; attachment strings, URLs, byte views and ArrayBuffers round-trip explicitly.
- Shared bundling policy and runtime sessions support getModels, both stream
  forms, concurrency, abort, failures, missing exports and process shutdown.
- CLI models/complete, help, CLI/architecture docs and an offline two-model fixture
  are implemented; CLI e2e exercises listing, both stream forms and invalid usage.
- All 78 requested API paths have typed evidence; compat reports regenerated.
  No dependencies added. Focused tests: protocol/runtime/host provider.test.ts.

Not done / risks:

- AI.ask routing, refreshModels and experimental_decide remain task 0046.
- Abort suppresses late output and calls iterator return; the declared provider
  signature has no signal, so blocked producers may run until bounded shutdown.
- Text-only streams emit text-delta and transport end, without inventing a finish
  reason or usage. CLI prints finish parts when the provider supplies them.
- Other request fields and stream parts must be JSON; only file attachment data
  receives the explicit non-JSON codec. No real network models were exercised.
- This task exceeds the approximate 600-line guideline because it includes the
  full declared type union, validators, fixture, boundary tests and generated reports.
