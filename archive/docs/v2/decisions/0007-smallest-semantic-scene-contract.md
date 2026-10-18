# ADR 0007: Smallest semantic scene contract

- Status: accepted
- Date: 2026-08-28

## Context

ADR 0004 isolates React reconciliation behind a transport-independent scene
mutation sink, and the first vertical slice must render a list with one action
before the reconciler exists. The wire contract therefore needs semantic scene
nodes, ordered transactions, and user events without committing to React,
Electron, or a concrete transport.

## Decision

`@blastlauncher/scene` owns the semantic scene contract, mirroring the Raycast
component vocabulary so the compatibility adapter stays thin:

- node types are `list`, `list-item`, and `action`; a `list` contains
  `list-item` children, and a `list-item` contains `action` children;
- properties use a documented per-type whitelist with Raycast names
  (`navigationTitle`, `searchBarPlaceholder`, `isLoading`, `title`, `subtitle`,
  `onAction`), fixed value types, and required properties (`title`,
  `onAction`);
- `scene.transaction` carries one ordered transaction per commit with
  `snapshot`, `insert`, `update`, `remove`, and `reorder` operations;
  `update` treats an explicit `null` as property removal;
- a full-tree `snapshot` is used only for initial attachment and recovery;
- `scene.event` carries an opaque event identifier owned by the extension
  runtime, keeping interaction handling on the extension side;
- validators reject unknown node types, unwhitelisted properties, wrong value
  types, missing required properties, and invalid parent-child placement;
- `SceneStateBuffer` applies transactions to a materialized state and enforces
  referential integrity with structured error codes;
- `SceneTransactionSink` is the renderer-facing boundary from ADR 0004, with a
  deterministic collecting sink for tests.

Scene messages live in the scene domain package, not in
`@blastlauncher/protocol`, following the extension contract precedent: the
protocol package validates common envelopes, and domain packages validate
their own payloads.

## Consequences

- the React renderer can be built and conformance-tested before any client
  exists;
- small state changes stay bounded instead of resending complete trees;
- non-React producers and non-Electron clients share one scene contract;
- the whitelist grows deliberately as compatibility is measured, never
  implicitly;
- scenes do not carry styling or client widget details; presentation remains
  a client concern.
