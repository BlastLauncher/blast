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

- [ ] Runtime tests: AI.ask resolve/stream/abort/denied; browser tabs and
      content; canAccess reflects host availability.
- [ ] Protocol tests for the `init.environment` change; CLI e2e for both flags.
- [ ] No non-deprecated path in the narrowed scope missing; partials explained in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Calling a real AI model or browser.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
