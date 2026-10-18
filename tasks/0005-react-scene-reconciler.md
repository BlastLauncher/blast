---
id: "0005"
title: React reconciler that publishes whole-scene snapshots
status: doing
milestone: M1
depends: []
---

## Goal

`packages/runtime` (`@blastlauncher/runtime`) gets a custom React renderer that
turns a React tree of host elements into serializable scene snapshots after
every commit, and dispatches handler references back to the right callback.

## Context

- Read `docs/decisions/0001-process-and-scene-model.md`.
- Dependencies (exact pins, check `npm view` first): `react`,
  `react-reconciler` (currently 19.3.1 / 0.34.0), dev `@types/react`,
  `@types/react-reconciler` if needed.
- Scene node shape matches the protocol (`{ id, type, props, children }`,
  handler props as `{ $handler: "<propName>" }`). Define the types locally in
  this task; task 0004 is building `@blastlauncher/protocol` in parallel and a
  later task switches imports over. Keep the local types in one file.
- API in `src/reconciler/`:
  `createSceneRoot({ publish, onWarning })` →
  `{ render(element), unmount(), dispatch(nodeId, handler, args): unknown,
  flush(): void }`. `publish({ revision, root })` is called once per commit
  with a fresh, fully serialized tree; `revision` starts at 1 and increments.
- Host elements are any string type (`createElement("List.Item", props)`);
  the API shim (later task) chooses names. Text children become nodes of type
  `#text` with `props: { text }`.
- Node ids are stable for the lifetime of a host instance and unique within a
  root (a counter is fine). `children` and `key` are not props.
- Prop serialization: JSON values pass through; functions become handler refs
  and are registered for `dispatch`; `undefined` props are dropped; anything
  else (React elements, class instances, symbols, `Date`, NaN/Infinity) is
  dropped with `onWarning(message)` naming node type and prop. Nested
  plain objects/arrays are serialized recursively with the same rules.
- `dispatch` for an unknown node/handler throws a clear error; for a known one
  returns the callback's return value (may be a promise).
- Deterministic tests: use a synchronous root/update path and `flush()` so
  tests never sleep. State updates triggered from `dispatch` must produce a new
  snapshot after `flush()`.

## Acceptance

- [ ] Tests: initial render snapshot; update of props produces revision 2 with
      the same node ids; insert/remove/reorder of keyed children; text nodes;
      handler ref serialization and `dispatch` invoking the latest callback
      after re-render; `useState` update via `dispatch`; dropped
      non-serializable props warn; unmount publishes `root: null`.
- [ ] Runs under Node 24 too: one test spawns `node` on a tiny script that
      imports the reconciler and prints a snapshot as JSON.
- [ ] `bun run verify` passes.

## Out of scope

- Raycast components (`List`, `Action`, …) — task 0006.
- stdio/process entry — task 0007.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
