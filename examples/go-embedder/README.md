# go-embedder

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

A minimal non-JS embedder of Blast, in Go with the standard library only. It
spawns `blast serve` and speaks embedder protocol v1 over NDJSON stdio
(`docs/embedding.md`): it opts into views, draws the list view and forwards
semantic input. It answers the `clipboard.copy` capability by printing the
copied text.

## Run

From this directory:

    go run . ../../fixtures/extensions/hello-list index

Keys are mapped to semantic `session.input` messages:

- `↑`/`↓` or `k`/`j`: move the selection
- `Enter`: run the selected row's `primary` action
- `?`: open the action panel
- printable text: update `search.text`; Backspace removes one character
- `Escape`: go `back`
- Ctrl-D (stdin EOF): shut the server down

`-serve` points at the `packages/serve/src/main.ts` entry, which is spawned
with `node`.

## Test

    go test ./...

Runs the same flow against the real server and the `hello-list` fixture and
asserts the handshake, selected list row, semantic selection movement,
primary action, and clipboard round trip. `bun run example:go` runs it.
