# `@blastlauncher/react-renderer`

React renderer adapter for Blast V2 (ADR 0004).

The package runs a React tree on `react-reconciler` and translates every host
commit into one ordered `SceneTransaction` published to a supplied
`SceneTransactionSink`. It is the authoring-model bridge: extensions write
React components, clients receive scene transactions, and React never becomes
the wire protocol.

## Components and props

- `SceneList`, `SceneListItem`, `SceneListSection`, and `SceneAction` render the
  scene node types `list`, `list-item`, `list-section`, and `action`; form and
  action-group nodes can also be authored with the corresponding intrinsic
  scene type names;
- props are serialized through the documented per-type
  `SCENE_PROP_WHITELIST`; unknown properties, text nodes, portals, and
  invalid roots are contract violations that fail loudly;
- callbacks (`onAction` and form-control `onChange`) are translated into
  opaque event identifiers owned by the renderer: identifiers stay stable
  while the callback identity is stable and are released when the node
  unmounts.

## Behavior

- the first commit publishes one full-tree snapshot; later commits publish
  only the collected insert, update, remove, and reorder operations;
- commits are synchronous: `render` uses the reconciler's sync work APIs, so
  one transaction is queued per commit with no timing dependence;
- `dispatchSceneEvent` routes a `scene.event` payload to the registered
  callback and fails for unknown identifiers;
- component render errors are reported through `onError` and keep the
  client's last good scene instead of publishing a broken tree;
- `flush` drains pending sync work, passive effects, and sink publishes;
  `unmount` clears the scene and the event registry without publishing.

## Boundaries

The renderer knows nothing about transports, sessions, processes, or the
desktop: it only emits transactions to the sink and consumes event payloads.
React and `react-reconciler` are pinned dependencies; renderer conformance
fixtures guard upgrades.
