# `@blastlauncher/scene`

Semantic scene contract for Blast V2 (ADR 0007).

The package defines the semantic scene vocabulary for the current vertical
slice: list/detail/action nodes, action groups, and measured form controls
with Raycast-named property whitelists, ordered `scene.transaction` messages,
and `scene.event` messages carrying opaque event identifiers and optional
validated form values.

## Contents

- `validateSceneTransactionMessage` and `validateSceneEventMessage` validate
  wire messages after the common protocol envelope has been accepted;
- `SceneStateBuffer` applies ordered transactions to a materialized scene and
  enforces referential integrity (`unknown_node`, `unknown_parent`,
  `duplicate_node`, `invalid_child`, `invalid_index`, `invalid_prop`,
  `missing_required_prop`, `remove_root`, `orphan_node`, `reorder_mismatch`);
- `SceneTransactionSink` is the transport-independent boundary the React
  renderer publishes to (ADR 0004); `createCollectingSceneSink` is the
  deterministic in-memory implementation for tests;
- `update` treats an explicit `null` as property removal, and full-tree
  `snapshot` operations are reserved for initial attachment and recovery.

## Boundaries

The package depends only on `@blastlauncher/protocol`. It must not depend on
React, Electron, Node.js runtime APIs, or a concrete transport, and it must
not define client widgets or styling.
