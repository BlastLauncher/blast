---
id: "0043"
title: AI, BrowserExtension and Tool APIs via capabilities
status: doing
milestone: M3
depends: []
---

## Goal

`AI.ask` (79 extensions), `AI.Model`, `BrowserExtension.getTabs`/
`getContent` (60), `Tool.Confirmation`, `unstable_AI` and `useUnstableAI`
exist and work through deny-by-default capabilities with deterministic
headless answers.

## Context

- Scope (round 2, narrowed after round 1 correctly blocked): `AI` (the
  namespace value), `AI.ask`, `AI.AskOptions*`, `AI.Creativity`,
  `AI.ModelSelector*`, `AI.Model` and its members (generated enum, task 0031),
  every `BrowserExtension*` and `Tool*` path, `unstable_AI`,
  `useUnstableAI`. Deferred to task 0045, leave missing: `AI.experimental_decide`,
  `AI.refreshModels`, and the model-provider types (`AI.RegisteredModel*`,
  `AI.GetModels`, `AI.StreamCompletion`, `AI.Model{Message,MessageContent,Tool,
  ToolSet,ProviderOptions,Request,TextStream,StreamPart,FullStream,Stream}*`).
  `AI.ask` with a `{ id }` ModelSelector (extension-provided model) rejects
  with a clear "model providers are not supported yet" error for now.
  Read the declarations in `compat/raycast-api/index.d.ts` exactly.
- `AI.ask(prompt, options)` returns a Promise that is also an event emitter
  (`on("data", chunk)`), and honors `options.signal`. Capability `ai.ask`
  with `{ prompt, model, creativity }`; the host answers with full text.
  The runtime emits it as one `data` chunk then resolves. Abort rejects with
  an `AbortError`. Headless: `--ai-answer <text>` answers; otherwise denied.
- `environment.canAccess(AI)` / `canAccess(BrowserExtension)` (task 0040)
  derives from stubs; once implemented they are no longer stubs, so
  `canAccess` must instead report whether the host grants the capability.
  Keep it synchronous: the host sends the set of available optional APIs in
  `init.environment` (protocol change + validation + tests). Headless: `AI`
  available only with `--ai-answer`, `BrowserExtension` only with
  `--browser-tabs <file.json>`.
- `BrowserExtension.getTabs()` → `browser.tabs`; `getContent({ cssSelector,
  tabId, format })` → `browser.content`. Headless: tabs from
  `--browser-tabs <file.json>` (validated like `--applications`); content
  from a `content` field in that file per tab, else rejects.
- `Tool.Confirmation` is a type; cover with typed test evidence.
- Document new flags in `--help` and `docs/cli.md` (table), capabilities in
  `docs/architecture.md` briefly. `@covers`, `compat:report`, `fmt`.
  Parallel workers: 0042 (Form), 0044 (window management + leftovers).

## Acceptance

- [x] Runtime tests: AI.ask resolve/stream/abort/denied; browser tabs and
      content; canAccess reflects host availability.
- [x] Protocol tests for the `init.environment` change; CLI e2e for both flags.
- [x] No non-deprecated path in the narrowed scope missing; partials explained in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Calling a real AI model or browser.

## Handoff

```
Branch/commit: t3/ai-browser-tools @ 7713f382c1b7e30c4a96b6bf3ed0854b8fd1aa3a (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 40.3s
Done:
- Implemented AI.ask Promise/data streaming, abort handling, generated Model values, aliases and typed option evidence.
- Implemented BrowserExtension capability clients and typed Tool confirmation evidence.
- Added validated optional API availability to init.environment and synchronous canAccess grants.
- Added --ai-answer / validated --browser-tabs, Node CLI e2e coverage, protocol/runtime/host tests and docs; regenerated compat evidence with no missing non-deprecated paths in scope. 394 tests pass. No dependencies added.
Not done / risks:
- AI.ask, AskOptions.model, ModelSelector and ModelSelector.id remain partial because extension-provided { id } models explicitly reject; provider APIs, experimental_decide and refreshModels remain deferred to 0045.
- BrowserExtension.getContent is partial: the runtime forwards options, but headless supplied content has no format conversion and rejects CSS selectors. Without tabId, the first active supplied tab stands in for the focused window.
- Abort stops waiting and suppresses late data; it does not cancel work already submitted to the host.
```
