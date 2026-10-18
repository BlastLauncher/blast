# ADR 0098: Start an explicitly configured V2 daemon from Electron

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0096 made the Electron main process the owner of the V2 client socket, and
ADR 0097 gave that client an opt-in semantic renderer. The app can still only
use a V2 daemon that another process has started. When V2 is enabled, the
legacy WebSocket runtime is also started even though the V2 renderer does not
use it.

The repository has a trusted `NodeCoreDaemon` composition, but it deliberately
requires explicit catalog, bootstrap, environment, and socket inputs. Choosing
an installed-extension migration layout or silently selecting a packaged
bootstrap would be a separate product and distribution decision.

## Decision

Add a conservative Electron-owned opt-in mode:

- when all of `BLAST_V2_CATALOG_ROOT`, `BLAST_V2_BOOTSTRAP_PATH`, and
  `BLAST_V2_SOCKET_PATH` are present, the main process starts
  `NodeCoreDaemon` before registering the V2 client bridge;
- each of those three paths must be absolute and is passed to the existing
  catalog/daemon boundary without reinterpretation. `BLAST_V2_NODE_EXECUTABLE`
  may override the managed Node executable, but it must also be absolute;
- extension children receive an explicit environment object based on the app
  environment with the managed Node `bin` directory first in `PATH`. The
  existing no-shell launcher, protocol-only stdio, and catalog-owned path
  resolution remain unchanged;
- when only `BLAST_V2_SOCKET_PATH` is present, retain the ADR 0096 external
  daemon mode. When V2 bridge registration succeeds, do not start the unused
  V1 WebSocket runtime;
- if the explicit daemon configuration fails validation or startup, log the
  failure and fall back to the existing V1 runtime without registering the V2
  bridge; and
- on application quit, close the V2 client bridge and app-owned daemon through
  their existing lifecycle APIs.

The app does not provide defaults for the catalog root, bootstrap, or socket,
does not translate the current V1 npm installation layout, and does not add a
packaged V2 bootstrap in this slice. Those remain explicit follow-up decisions.

## Boundary

This proves Electron ownership of one opt-in daemon lifecycle while retaining
the externally started socket mode and the V1 rollback path. The bootstrap and
catalog are still caller-provided, so this is not yet the normal packaged
installation path.

## Consequences

Development and integration environments can run one command to start the
daemon and one client window against the same explicit paths. The main process
no longer launches an unused V1 runtime when V2 is active. Invalid or
incomplete V2 configuration cannot silently replace the default app path.

## Verification

- unit-test the pure environment configuration parser and absolute-path rules;
- type-check and Forge-bundle the Electron app for Linux/arm64;
- keep the full V2 suite green; and
- verify that the existing external-socket and no-variable V1 modes remain
  unchanged.
