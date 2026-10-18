---
id: "0009"
title: blast debug CLI and end-to-end fixture test
status: review
milestone: M1
depends: ["0008"]
---

## Goal

`bun run blast run <extensionDir> <command>` runs a Raycast extension command
headlessly, prints each scene as a readable tree, and can be driven by a
script — the primary tool for agents to debug compatibility and for e2e tests.

## Context

- Build on `@blastlauncher/host` (task 0008). CLI file:
  `packages/host/src/cli.ts`; root script `"blast": "node
  packages/host/src/cli.ts"`. Must run under plain Node 24.
- Flags: `--grant <capability>` (repeatable; a granted `clipboard.copy` just
  records/prints the text — no OS clipboard yet), `--script <file|->`,
  `--json` (emit protocol-shaped NDJSON instead of text trees),
  `--timeout <ms>`.
- Text tree format: one node per line, two-space indent,
  `Type "title" key=value…` with handler props shown as `[onAction]`; stable
  ordering so output is snapshot-testable. Logs and capability requests
  printed as `# log …` / `# capability clipboard.copy {"text":"…"}`.
- Script commands, one per line (`#` comments): `action <title>` (find an
  `Action*` node by title and dispatch `onAction`), `search <text>` (dispatch
  the `List` `onSearchTextChange`), `wait` (until next scene), `expect <text>`
  (fail unless the latest tree contains the text), `quit`. Without a script:
  print the first scene and exit.
- Exit codes: 0 success, 1 script/expectation failure, 2 usage error,
  3 extension crashed or protocol error.
- Fixture `fixtures/extensions/hello-list/`: manifest + `src/index.tsx` with a
  List of 2–3 items, each with an ActionPanel holding Action.CopyToClipboard
  and an Action that changes state.

## Acceptance

- [ ] E2E test runs the CLI as a `node` child process against the fixture:
      text output snapshot of the first scene; script that copies an item
      prints the capability line and exits 0; without `--grant` the copy is
      denied and reported; failing `expect` exits 1; crash fixture exits 3.
- [ ] `bun run blast run fixtures/extensions/hello-list index` works by hand.
- [ ] Short usage text (`--help`) and a "Debugging extensions" paragraph in
      `docs/architecture.md`.
- [ ] `bun run verify` passes.

## Out of scope

- Interactive TUI, real clipboard, fetching real extensions (M2).

## Handoff

```
Branch/commit: t3/blast-debug-cli @ 7a8005c
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 9.8s
Done:
- `packages/host/src/cli.ts`: `blast run <extensionDir> <command>` under plain
  Node 24 (no new deps; `node:util` parseArgs). Flags: repeatable `--grant`,
  `--script <file|->`, `--json` protocol NDJSON, `--timeout <ms>`, `--help`.
  Text trees print one node per line with handler props as `[onAction]`,
  `# log` / `# capability` lines for logs and capability requests; script
  engine implements action/search/wait/expect/quit. Exit codes 0/1/2/3 per
  the task; temp bundle dirs removed on every path, signal handlers included.
- Fixture `fixtures/extensions/hello-list/` (List of 3 items, per-item
  ActionPanel with Action.CopyToClipboard + Pin action, onSearchTextChange).
- E2E suite `packages/host/src/cli.test.ts` spawns the CLI as a real `node`
  child process: first-scene snapshot, granted copy prints the capability
  line, denial reported without `--grant`, failing expect and unknown script
  command exit 1, crash exits 3, `--json` NDJSON, usage errors exit 2,
  `--timeout` aborts a hanging script. No leftover processes or temp files.
- Root script `"blast": "node packages/host/src/cli.ts"`;
  `bun run blast run fixtures/extensions/hello-list index` works by hand.
- "Debugging extensions" section added to docs/architecture.md.
Not done / risks:
- `--grant` handlers only record and succeed (no OS clipboard), per task scope.
- An unmount publishes a `{root: null}` scene; the CLI streams it in `--json`
  mode (honest protocol output) but prints nothing for it in text mode.
- `List.onSearchTextChange` is not yet declared on the shim's `ListProps`;
  the CLI dispatches it through the generic handler passthrough, so the
  fixture's search works without an API-surface change to `@blastlauncher/runtime`.
```
