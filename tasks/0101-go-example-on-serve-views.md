---
id: "0101"
title: Move the Go embedder example onto blast serve views
status: doing
milestone: M6
depends: []
---

## Goal

`examples/go-embedder` is a thin client of the engine: it opts into
`blast serve` views, draws the `session.view` model and forwards semantic
inputs, instead of walking raw scene trees and choosing actions itself. CI
runs its tests.

## Context

Today `examples/go-embedder/main.go` (708 lines, task 0068) prints raw
`session.scene` trees, marks the first `List.Item` as selected and runs that
item's first action on Enter. Task 0080 moved that client logic into the
engine: `extension.launch {..., views: {platform}}` makes the server send
`session.view {session, view}` (a client-core `ControllerView`), and the client
sends `session.input {session, input}` (`up`/`down` moves, `search`,
`primary`, `openActions`, `back`, `key`, `toastAction`, `alert` …). See
`docs/embedding.md` "Views", `packages/protocol/src/embedder-schema.ts`
(`controllerInput`, `controllerView`) and `packages/client-core/src/controller.ts`.

The embedder schema describes `controllerView` as opaque JSON, so a non-JS
embedder has no documented shape. Document the parts of `ControllerView` the
example uses (at least the list view: rows, selection, search text, action
panel, toast) in `docs/embedding.md`, derived from `controller.ts`.

Keep the example standard-library only and small; it should get shorter, not
longer. Keep answering `clipboard.copy` by printing the text.

## Acceptance

- [ ] The example launches with `views`, renders `session.view` (list rows with
      the selection marked, search text, action panel when open, toasts) and
      never inspects `session.scene`.
- [ ] Terminal input maps to `session.input`: arrow keys or `j`/`k` move,
      Enter runs `primary`, a key opens the action panel, typed text searches,
      Escape is `back`. Document the keys in its README.
- [ ] `go test ./...` drives the real server with the `hello-list` fixture:
      handshake, a list view with a selected row, moving the selection, running
      `primary` and the `clipboard.copy` round trip.
- [ ] `docs/embedding.md` documents the `ControllerView` fields the example
      uses. If a complete JSON schema for `ControllerView` is warranted, say so
      in Handoff instead of doing it here.
- [ ] CI runs the Go example's tests in a separate job (actions pinned by SHA,
      as in `ci.yml`, with the Go version from `go.mod`).
- [ ] `bun run verify` passes; `bun run example:go` passes locally.

## Out of scope

- Changing the protocol, `client-core` or the server.
- Raw-scene rendering in the example.

## Handoff

```
Branch/commit: t3/7d87c6a0 @ 3947478
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 52.5s
Done:
- Reworked the Go example to opt into `blast serve` views, render list/action/toast state, and send semantic `session.input` messages.
- Added real-server Go coverage for handshake, selected-row movement, primary action, and clipboard.copy.
- Documented terminal keys, ControllerView fields, and added a pinned Go CI job using `go-version-file`.
Not done / risks: A complete ControllerView JSON Schema is not warranted for this example; the protocol intentionally keeps that model opaque and the docs cover the fields this client draws.
```
