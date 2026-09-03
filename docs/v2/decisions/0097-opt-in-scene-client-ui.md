# ADR 0097: Render V2 scenes behind the opt-in client bridge

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0096 put the V2 socket and client lifecycle in the Electron main process,
but the existing renderer still consumes the V1 mutable element tree. The
bridge is not useful to an operator until a renderer can display its
path-free command snapshot and semantic scene state.

The first renderer migration must remain reversible. It should exercise the
scene contract and event path without pretending that every SceneNode type,
production daemon bootstrap, or installed-extension migration is complete.

## Decision

Add an opt-in V2 renderer selected by the presence of the main-process V2 API:

- skip the legacy WebSocket setup when `window.electron.v2` is available and
  subscribe to one serialized snapshot/toast stream;
- show path-free command discovery and launch/stop controls, then render the
  measured List, Grid, Detail, and Form scene roots with semantic action,
  selection, pagination, dropdown, form-control, and submit events; and
- keep transport and filesystem details in the main process. Renderer actions
  send only stable command identities, event IDs, and JSON-compatible form
  values through the preload API.

The renderer handles scene members outside this initial view set with an
explicit unsupported-state message. It does not reconstruct the V1 element
tree, read extension paths, open sockets, or add a second client receive pump.
The V1 WebSocket renderer remains the default when the opt-in API is absent.

## Boundary

This slice proves the client-to-renderer semantic path for the first useful
scene roots. It does not start a daemon, choose a persistent catalog or
installation layout, implement every menu/metadata/accessory visual, or make
the V2 UI the default application path.

## Consequences

The existing app can exercise a real V2 daemon through one main-process-owned
connection while retaining a rollback switch: remove the socket opt-in and
the legacy renderer is unchanged. The renderer is deliberately a thin view of
validated snapshots; future visual coverage can grow without changing the
protocol or moving privileged operations into the renderer.

## Verification

- type-check the renderer and main/preload bridge with the Electron app
  configuration;
- run the full V2 suite and client host tests;
- Forge-bundle the opt-in path for Linux/arm64 without launching Electron; and
- keep the V1 renderer path unchanged when no V2 bridge is exposed.
