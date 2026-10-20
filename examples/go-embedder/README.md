# go-embedder

A minimal non-JS embedder of Blast, in Go with the standard library only. It
spawns `blast serve` and speaks embedder protocol v1 over NDJSON stdio
(`docs/embedding.md`): it opens an extension, launches a command, prints every
published scene as an indented tree (the first `List.Item` marked as the
selection), runs the selected item's primary action when you press Enter, and
answers the `clipboard.copy` capability by printing the copied text.

## Run

From this directory:

    go run . ../../fixtures/extensions/hello-list index

Press Enter to run the first action of the first item; Ctrl-D (stdin EOF)
shuts the server down, as does the session ending. `-serve` points at the
`packages/serve/src/main.ts` entry, which is spawned with `node`.

## Test

    go test ./...

Runs the same flow against the real server and the `hello-list` fixture and
asserts the handshake, a printed scene and the clipboard round trip. CI has no
Go, so this is not part of `bun run verify`; `bun run example:go` runs it.
