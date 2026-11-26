# 0020 — Embedder protocol 2: views as state plus patches

Status: accepted 2026-11-26; amends 0009 and 0014 (wire only)

## Context

`blast serve` sends a whole `ControllerView` on every update and a whole
`SceneMessage` on every commit. `docs/performance.md`: one arrow-down in a
10,000-item list sends 1.86 MiB; a one-row edit sends 5.52 MiB, while the
runtime → host wire already carries 193 B (`scene.patch`, decision 0019).
Embedders draw views only (0014); nobody draws from `session.scene`. There are
no external users of protocol 1, so it is replaced, not extended.

## Decision

1. **Protocol 2 only.** `EMBEDDER_PROTOCOL_VERSION = 2`; schema
   `embedder-v2.schema.json`. A protocol-1 hello gets the version error.
2. **Full view, then patches.** Per root and per session, serve sends
   `root.view` / `session.view` with `{ view, revision }` first, then
   `root.view.patch` / `session.view.patch` with
   `{ revision, baseRevision, ops }`. `revision` starts at 1 and increases by
   exactly 1 per event of either kind; `baseRevision = revision - 1`. An update
   with no ops sends nothing and does not consume a revision.
3. **Ops are a small generic JSON patch,** independent of view fields, so a
   client in any language applies them in a few dozen lines. `path` is an array
   of object keys from the view root (never array indices):
   - `{ op: "set", path, value }` — replace or add the value at `path`.
   - `{ op: "delete", path }` — remove an optional key.
   - `{ op: "splice", path, at, remove, insert }` — on the array at `path`,
     remove `remove` items at index `at` and insert `insert` there.
     Diff rule (`diffView`): two plain objects recurse key by key; two arrays
     become at most one `splice` covering the span between their longest equal
     prefix and suffix (deep equality); anything else is `set`. A splice that
     would replace the whole array is sent as `set`.
4. **Resync.** A client whose `baseRevision` does not match its current
   revision must not guess: it sends `root.resync { root }` /
   `session.resync { session }` and drops patches until the next full view.
5. **Scenes on request.** `session.scene` (full scenes, unpatched) is sent only
   when the hello has `scenes: true`; it is a debugging tap, not a drawing API.
6. **Reference code.** `@blastlauncher/protocol` exports `diffView` and
   `applyViewPatch` (pure, dependency-free). Serve keeps the last sent view per
   root/session to diff against. Examples in Swift, Go and Python each carry
   their own applier with tests (task 0196).

## Why

Views stay the only drawing contract and stay self-describing; the diff is
generic, so adding a view field never changes the protocol. Prefix/suffix
splices cover the cases that dominate traffic — a row edit, a selection move
(two adjacent rows), a filtered list — without a tree diff in every client
language. Strict revisions make lost or reordered events detectable.

## Consequences

- Every embedder must implement the three ops and resync; a full view is
  always a valid recovery point.
- Serve holds one previous view per root/session in memory.
- Per-row `selected` flags stay: a selection move costs two small row patches.
- Reordering many rows (rare) degrades to one large splice, never worse than a full view.
