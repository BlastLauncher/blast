# go-embedder

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

A minimal non-JS embedder of Blast, in Go with the standard library only. It
spawns `blast serve` and speaks embedder protocol v1 over NDJSON stdio
(`docs/embedding.md`): it opts into views in the hello, opens the extension
directories given on the command line, draws the engine's root search view and
forwards semantic input. It answers the `clipboard.copy` capability by
printing the copied text.

## Run

From this directory:

    go run . ../../fixtures/extensions/hello-list

Keys are mapped to semantic `root.input`/`session.input` messages (keys go to
the launched session while it runs, then back to the root):

- `↑`/`↓` or `k`/`j`: move the selection
- `Enter`: run the selected row's `primary` action
- `?`: open the action panel
- printable text: update `search.text`; Backspace removes one character
- `Escape`: go `back`
- Ctrl-D (stdin EOF): shut the server down

`-serve` points at the `packages/serve/src/main.ts` entry, which is spawned
with `node`. Outside a checkout, `npm install @blastlauncher/serve@next` and
pass `-serve node_modules/@blastlauncher/serve/dist/main.js`.

## Test

    go test ./...

Runs the same flow against the real server and the `hello-list` fixture plus
the 0157 prompt-form fixture, and asserts the handshake, root search, launch,
prompt form, primary action, clipboard round trip and shutdown. `bun run
example:go` runs it.
