# Blast V2 migration plan

Blast V2 is a clean-slate implementation inside the existing repository. The
prototype stays runnable while the new boundaries are proved. Removal happens
only after a replacement path exists.

## Phase 0: baseline

- Merge and preserve the reproducible Node.js, pnpm, CI, and packaging setup.
- Record the V1 package graph and known architectural coupling.
- Keep V1 builds and tests green while V2 is introduced.

Exit condition: a clean checkout uses the pinned toolchain and passes the
existing checks.

## Phase 1: protocol and lifecycle foundation

- Add the transport-neutral protocol package.
- Add the extension-host lifecycle boundary.
- Implement handshake negotiation and an in-memory test connection.
- Define structured error and shutdown behavior.
- Record the React reconciler as a scene adapter without implementing scene
  messages ahead of the first vertical slice.

Exit condition: a test process can negotiate, exchange a message, cancel, and
shut down without Electron or WebSocket.

Implementation note: protocol validation, the session state machine, and the
reusable transport conformance suite complete the in-memory portion of this
phase. A real child-process transport and process fixture are the remaining
Phase 1 work.

## Phase 2: compatibility census

- Build a static scanner for extension manifests and `@raycast/api` imports.
- Select a varied fixture set of real extensions.
- Publish a generated support matrix by API, command, platform, and failure
  reason.

Exit condition: the first supported API subset is justified by corpus usage and
named fixtures.

## Phase 3: first vertical slice

- Start one extension command in an isolated Node.js process.
- Translate `List`, `List.Item`, `ActionPanel`, and one action.
- Render the semantic operations in the desktop client.
- Broker clipboard access and report a denied request.
- Surface crashes and logs without terminating the client or core.

Exit condition: the scenario in the V2 product document passes as an automated
integration test.

## Phase 4: useful compatibility subset

- Expand components and capabilities in census order.
- Add preferences, local storage, detail, form, grid, notifications, URL
  opening, OAuth, and secure storage as justified by fixtures.
- Introduce reviewable compatibility patches for abandoned extensions.

Exit condition: Blast publishes an evidence-backed compatibility report for a
representative extension set.

## Phase 5: cutover

- Point the desktop client at the V2 core and extension host.
- Mark V1 packages as legacy and freeze their public behavior.
- Remove V1 only in a dedicated, reviewable change after feature and migration
  criteria are met.

Exit condition: normal development and packaging no longer depend on V1.

## Deferred work

Remote execution, mobile clients, Quickshell integration, an agent control
plane, and alternative JavaScript runtimes remain valid directions. V2 keeps
their architectural seams open, but none is allowed to delay the first useful
compatibility release.
