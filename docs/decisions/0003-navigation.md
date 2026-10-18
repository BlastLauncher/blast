# 0003 — Navigation in scene snapshots

Status: accepted 2026-10-18

## Decision

Each view command runs inside a runtime-owned navigation provider. Its scene
root is `Navigation`, with `props.depth` and one `Navigation.Entry` child per
stack entry in bottom-to-top order. Entry props contain `active`: only the
last entry is active. The active entry contains its view; covered entries
have no scene children. They stay mounted in React, preserving component
state and effects, but their handlers are absent from the dispatch registry.
Popping unmounts the removed view and restores the previous view's stable ids.
The initial command is never popped; `useNavigation().pop()` there is a no-op.

`Navigation.props.pop` is a handler reference present only above depth one.
Clients request back by dispatching the existing event message to this node
and handler. `Action.Push` exposes `onAction` in the scene and retains its
React target and lifecycle callbacks inside the runtime. No protocol version
or message changes are needed. The CLI's `back` command dispatches `pop`.

`push` appends a fresh keyed entry. `Action.Push.onPush` runs after scheduling
the push. An entry's `onPop` runs once when it is explicitly popped, before
React unmounts it; shutdown does not invoke navigation callbacks. Navigation
functions have stable identities and each command provider owns its stack.

## Consequences

Clients traverse only the active entry; covered view contents cannot be
selected or dispatched using old handler references. Whole-scene snapshots
still communicate depth and stack identity without serializing React nodes.
The wrapper is present even at depth one so pushing never remounts the root
command. Headless consumers must traverse beneath it to find the view.
