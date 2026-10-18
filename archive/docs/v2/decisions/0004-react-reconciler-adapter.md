# ADR 0004: Isolate React reconciliation behind a scene adapter

- Status: accepted
- Date: 2026-08-27

## Context

Raycast extensions are React applications. Supporting their state, hooks,
effects, context, and component lifecycle requires a React renderer rather than
a one-time JSX parser.

The V1 custom renderer combines several responsibilities. Its host context
contains the WebSocket RPC server, API hooks register RPC methods directly, and
every React commit serializes and emits the complete element tree. That makes
React and WebSocket part of the system boundary and creates unnecessary work for
small updates.

`react-reconciler` is explicitly experimental and does not offer the stability
guarantees of React DOM or React Native. Its host configuration can change even
when the public React component model remains compatible.

## Decision

Rewrite the reconciler as `@blastlauncher/react-renderer` when the first scene
vertical slice begins. It will be an adapter from React host operations to a
transport-independent scene mutation sink.

The renderer will:

- assign stable opaque identifiers to semantic nodes;
- collect insert, update, remove, and reorder operations during a commit;
- publish one ordered transaction to a supplied sink after the commit;
- provide a complete snapshot only for initial attachment and recovery;
- serialize a documented property whitelist;
- translate callbacks into opaque event identifiers owned by the extension
  runtime;
- pin compatible React and `react-reconciler` versions and run renderer
  conformance fixtures against upgrades.

The renderer will not:

- open sockets or know which transport carries a transaction;
- register RPC methods;
- execute clipboard, filesystem, URL, OAuth, or other host capabilities;
- define client widgets or styling;
- become the canonical application state store.

## Consequences

- React remains the compatibility authoring model without becoming Blast's wire
  protocol.
- Small state changes produce bounded mutations instead of complete tree
  replacement.
- Non-React extensions and non-Electron clients can use the same scene protocol.
- React reconciler upgrades remain a contained maintenance cost rather than a
  system-wide migration.
- Scene mutation types will be added to the protocol only with the first tested
  list/action vertical slice.
