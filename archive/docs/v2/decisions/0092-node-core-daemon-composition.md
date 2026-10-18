# ADR 0092: Compose the Node core daemon around the local listener

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0091 made the transport-neutral client/core session reachable over a
bounded same-user socket. A caller can still only use that listener by wiring
the filesystem catalog, Node extension launcher, extension host, `BlastCore`,
and listener independently. That leaves lifecycle ownership scattered at the
first boundary the desktop client will need.

The next slice should provide one explicit Node composition for the current
local deployment. It must retain the existing trust boundaries: the catalog
alone resolves entrypoint paths, the host owns child processes, the core owns
orchestration, and the listener owns client connections.

## Decision

Add `NodeCoreDaemon` to `@blastlauncher/core-node`:

- construct a `FilesystemExtensionCatalog`, `NodeExtensionProcessLauncher`,
  `ExtensionHost`, `BlastCore`, and `LocalCoreServer` from explicit catalog,
  bootstrap, environment, and socket options;
- require the extension process environment to be supplied explicitly, keep
  the fixed bootstrap and no-shell process policy of ADR 0006, and use
  deterministic monotonic IDs and named implementation identities by default;
- start the local listener as the daemon's externally visible readiness point;
  the core and host are constructed before startup but do not launch an
  extension until a client sends a validated command identity;
- close the listener first so new client work is rejected and connected
  sessions are stopped, then close the core/host so all child processes are
  drained; repeated start/close calls are idempotent within the state machine;
  and
- expose the composed catalog, host, core, and listener for application
  integration and diagnostics without adding command discovery messages,
  persistent catalog watching, authentication, desktop rendering, or Electron
  dependencies.

The daemon is an in-process Node composition for this slice. A future desktop
or standalone process may own it without changing the client/core protocol.

## Boundary

This slice proves one owner for the current local Node deployment, including
real child-process launch through the local socket. It does not define a
daemon executable, restart policy, persistent state, capability providers,
authenticated peer identity, or a client scene renderer.

## Consequences

The desktop client and deterministic tests can start one object and connect to
one stable endpoint without reproducing the dependency graph. Shutdown order
is explicit and leaves no child processes or owned socket behind. The
composition remains replaceable: alternate catalogs, transports, runtimes,
and clients continue to target the existing interfaces.

## Verification

- Construct the daemon with an explicit environment and temporary catalog and
  socket paths; start it and verify listener readiness and endpoint cleanup.
- Run a real fixture command through `connectCoreClient` over the local socket,
  observe scene/lifecycle traffic, and stop it through the same client API.
- Verify daemon close stops active commands, closes the listener before the
  core, and is safe to repeat; keep the full V2 suite green on ARM64 Linux.
