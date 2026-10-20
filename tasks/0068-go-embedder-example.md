---
id: "0068"
title: Minimal Go embedder over blast serve
status: doing
milestone: M5
depends: ["0066", "0067"]
---

## Goal

A small, dependency-free Go program shows a non-JS app embedding Blast. It
spawns `blast serve`, does the handshake, opens an extension, launches a
command, prints the scene as an indented tree, runs the selected item's
primary action from stdin, and answers `clipboard.copy` by printing the text.

## Context

- Read `docs/embedding.md`, `docs/decisions/0011-embedder-protocol.md` and
  `packages/protocol/schema/embedder-v1.schema.json`.
- Location: `examples/go-embedder/` (`go.mod` module
  `github.com/blastlauncher/blast/examples/go-embedder`, `main.go`, a
  `README.md` of 30 lines or less). Use the Go standard library only. Add
  `examples/` to the AGENTS.md-independent layout by listing it in
  `docs/architecture.md` (one line). Do not edit AGENTS.md.
- Behaviour:
  - `go run . <extensionDir> <command>` from `examples/go-embedder`, server
    path via flag `-serve` (default `../../packages/serve/src/main.ts`, run
    with `node`);
  - declare `clipboard.copy` in `hello`;
  - print each `session.scene` as a tree (type + title), mark the first
    `List.Item`, and pressing Enter on stdin sends the first `Action`'s
    `onAction` handler through `session.event`;
  - print `capability.request` for `clipboard.copy` and answer `ok`;
  - exit on `session.exited` or stdin EOF.
    Typed structs for messages match the schema (hand-written; no codegen).
- Test: `examples/go-embedder/main_test.go` runs against the real server with
  `fixtures/extensions/hello-list` (or a fixture with an Action that copies),
  asserting the handshake, a printed scene, and the clipboard round trip.
  `go test ./...` inside the example must pass on this machine (Go 1.27 is
  installed). It is NOT part of `bun run verify` (CI has no Go). Add
  `bun run example:go` running `cd examples/go-embedder && go test ./...`.
- Keep `go.sum` absent (no deps) and build output gitignored
  (`examples/go-embedder/go-embedder`).
- Exclude `examples/**` from oxlint/typecheck if they would scan it (they
  should not; check).

## Acceptance

- [ ] `bun run example:go` passes; paste its output summary in Handoff.
- [ ] `go vet ./...` is clean.
- [ ] `bun run verify` passes (unchanged scope).

## Out of scope

- Generated Go types, publishing a Go module, UI.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/go-embedder-example @ (this commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 144.9s — 667 pass, 0 fail
Done:
  - examples/go-embedder: dependency-free Go embedder (main.go, main_test.go,
    README.md ≤30 lines, go.mod module
    github.com/blastlauncher/blast/examples/go-embedder, no go.sum). It spawns
    `node packages/serve/src/main.ts` (`-serve` flag), handshakes
    hello/welcome v1 declaring clipboard.copy, opens + launches the command,
    prints every session.scene as an indented type+title tree marking the
    first List.Item with ` *`, dispatches the first Action's onAction via
    session.event on Enter, prints `capability.request clipboard.copy "…"` /
    `capability.result ok`, and exits on session.exited or stdin EOF. Message
    structs are hand-written against embedder-v1.schema.json.
  - main_test.go drives the real server against fixtures/extensions/hello-list
    (XDG_DATA_HOME pointed at a temp dir) and asserts the handshake, the
    printed tree, and the clipboard round trip; race-clean (`go test -race
    -count=2` passes).
  - `bun run example:go` runs `cd examples/go-embedder && go test ./...`
    (output: `ok github.com/blastlauncher/blast/examples/go-embedder 0.471s`).
  - docs/architecture.md lists examples/go-embedder. The file is at its
    200-line workflow cap, so the mention is a sentence appended to the
    existing embedding-pointer paragraph instead of a new line.
  - .gitignore ignores the build output `examples/go-embedder/go-embedder`.
  - oxlint/typecheck needed no excludes: tsc includes only scripts+packages;
    oxlint and oxfmt skip .go files (README.md is oxfmt-formatted and clean).
Not done / risks:
  - `go vet ./...` clean on Go 1.27.2; not run in CI (no Go there), per task.
  - One unrelated flake in the first verify run (packages/cli/src/cli.test.ts
    "browser tabs" child exited -1 under load); the file passes in isolation
    and a full verify rerun was green. No product code was touched.
```
