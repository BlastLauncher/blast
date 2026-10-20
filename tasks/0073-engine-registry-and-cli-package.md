---
id: "0073"
title: Engine handler registry; move blast CLI and headless answers to packages/cli
status: review
milestone: M5
depends: ["0064"]
---

## Goal

The engine core answers only session-scoped capabilities. Everything else is
registered by the embedder: once per engine, per extension, or per launch.
The `blast` CLI and its headless answers become a client package that
registers handlers like any embedder.

## Context

- Decision `docs/decisions/0010` (points 2 and 5). Read it first.
- Today `createSessionBroker` (`packages/host/src/client.ts`) always mixes in
  `createHeadlessHandlers` (`headless.ts`: neutral applications, selection,
  window, clipboard.read, browser and AI answers). Under 0010 that is client
  behaviour, so the engine must deny those names unless someone registers them.
- Engine registry:
  - Add `createEngine({ dataDir?, installer?, handlers? })` in
    `packages/host/src/engine.ts`, exported from the index. It returns:
    - `register(handlers)`, which returns an unregister function;
    - `openExtension(options)`, which inherits `dataDir`/`installer`/handlers
      and accepts its own `handlers`;
    - `close()`.
  - `ExtensionHandle.launch(..., { handlers })` stays.
  - Precedence, lowest to highest: engine-registered → extension → launch.
    Session-scoped engine handlers (storage, internal storage, OAuth tokens,
    own AI provider) apply last and cannot be shadowed, as today.
  - The standalone `openExtension` keeps working (an implicit engine with no
    registered handlers).
- Move into a new package `packages/cli` (`@blastlauncher/cli`, private, ESM,
  bin-free; `exports` `./src/index.ts`):
  - `cli.ts`, `headless.ts`, `browser.ts` (`parseBrowserTabs`,
    `createBrowserHandlers`), with their tests;
  - and any helper that only the CLI uses.
    `ai.ts`/`provider.ts` stay in host if non-CLI code uses them; check the
    imports.
  - The CLI registers `createHeadlessHandlers(...)` itself, so `blast run`
    output and exit codes stay byte-identical (existing CLI tests prove it).
  - Root `package.json` script: `"blast": "node packages/cli/src/cli.ts"`.
  - Update `scripts/corpus/*` imports, and `docs/cli.md` paths if any.
- TUI: `packages/tui/src/session.ts` and the picker register the headless
  handlers from `@blastlauncher/cli` explicitly where they relied on the
  implicit defaults, so TUI behaviour and tests are unchanged.
  - Another task (0074) adds a `--native` flag and a `handlers` prop on
    `CommandSession` in parallel; keep your TUI diff minimal.
- `packages/host` must no longer import `headless.ts` or `browser.ts`.
- Docs:
  - `docs/architecture.md`: the Packages table (`cli` row, host row wording);
  - "Host sessions": the registry and precedence, ≤ 8 lines;
  - `docs/capabilities.md`: say which answers are engine defaults
    (session-scoped) and which come from the CLI's headless handlers.

## Acceptance

- [x] Host test: with no registered handlers, `applications.list`,
      `selection.text`, `window.list` and `clipboard.read` answer `denied`.
      Storage, LocalStorage and OAuth tokens still work.
- [x] Host test: precedence engine → extension → launch is honoured, and a
      registered `storage.get` cannot shadow the session-scoped one.
- [x] `rg -n "headless|browser.ts" packages/host/src --glob '!*.test.ts'` prints
      nothing.
- [x] All CLI tests pass from `packages/cli` with unchanged expectations.
      `bun run blast run fixtures/extensions/hello-list index` output is
      unchanged.
- [x] `bun run corpus:smoke --help` (or its equivalent dry check) still
      resolves imports.
- [x] `bun run verify` passes.

## Out of scope

- `blast serve` (0066), the capability catalog (0072, parallel), native
  handlers (0074/0075), and renaming host to engine (0069).

## Handoff

Branch/commit: `t3/engine-registry-cli` @ `8f21ed6` (implementation; handoff committed separately)

Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 136.1s

Done:

- Added `createEngine` with live registration/unregistration, extension defaults,
  launch precedence and owned-handle shutdown; session storage/OAuth retain priority.
- Moved CLI, browser and headless handlers/tests to `@blastlauncher/cli`; TUI and
  corpus clients now register headless handlers explicitly. No external dependencies added.
- Updated workspace wiring, docs and generated compatibility evidence paths.
- Acceptance evidence: 575 tests pass (including unchanged CLI expectations),
  hello-list stdout matches the baseline byte-for-byte (`cmp`), and both corpus
  smoke entrypoints bundle with `bun build --target=bun --packages=external`.
  The host source `rg` acceptance check prints nothing.

Not done / risks: No implementation work skipped. Fresh review and merge belong
to the orchestrator. Parallel merges may require regenerating `bun.lock` and
`compat/` and reconciling the deliberately small TUI/docs edits. An earlier
overlapping CLI-only run hit existing five-second test deadlines; the full clean
gate passes without changing test expectations or timeouts.
