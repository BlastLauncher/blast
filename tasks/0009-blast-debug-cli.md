---
id: "0009"
title: blast debug CLI and end-to-end fixture test
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
