# ADR 0108: Make packaged V2 startup the application default

- Status: Accepted
- Date: 2026-08-31

## Context

The V2 Electron bridge, semantic renderer, app-owned daemon, packaged
bootstrap, and existing-extension catalog are now implemented behind explicit
configuration. The prototype V1 path is still selected when no V2 variables
are present. V1 has not been published as a production application, so keeping
it as the implicit default no longer protects a shipped compatibility promise;
it mainly prevents the new path from being exercised by normal launches.

The app still needs a deliberate escape hatch while the V2 path is exercised
more broadly. External-daemon development mode and explicit app-owned paths
also need to remain available for deterministic tests and local development.

## Decision

When no V2 configuration is supplied, the Electron main process selects the
packaged V2 configuration derived from its app resource and user-data roots.
In a Forge development launch it resolves the equivalent standalone resources
from the workspace build; in a packaged launch it uses `process.resourcesPath`.
That default uses the existing extension installation layout and the app-owned
local daemon endpoint already defined by [ADR
0100](0100-packaged-v2-bootstrap-and-catalog.md).

Support an explicit `BLAST_V2_MODE=legacy` escape hatch that selects the V1
WebSocket/runtime path. `BLAST_V2_MODE=packaged` remains an explicit spelling
of the default. Socket-only external-daemon mode and complete explicit
app-owned path configuration retain their existing precedence and validation.
Conflicting legacy and V2 daemon variables fail configuration rather than
silently selecting a different runtime.

If the default packaged V2 resources or daemon cannot start, the main process
reports the startup failure and does not silently fall back to V1. A hidden
fallback would make packaged compatibility failures look like missing
extensions and would make the default path difficult to verify. The explicit
legacy mode remains the rollback mechanism during development.

The selection is performed only in the Electron main process. The protocol,
core, extension host, compatibility adapter, renderer boundary, and resource
ownership rules do not change.

## Boundary

This slice changes application startup mode selection and failure reporting. It
does not add installation UI, migrate extension data, change the extension
catalog, or claim that platform-specific native modules are supported by Blast.
The packaged configuration continues to point at the existing user extension
roots; extension authors remain responsible for native module compatibility on
their target platform.

## Consequences

Normal packaged launches now exercise V2 and the platform-neutral client path.
Developers can use `BLAST_V2_MODE=legacy` for the prototype client, a socket-only
variable for an external daemon, or complete path variables for isolated V2
fixtures. Startup failures are visible instead of being masked by an implicit
runtime downgrade.

## Verification

- cover default packaged, explicit packaged, legacy, external-daemon, and
  explicit app-owned configuration selection;
- cover conflicting and failed default startup behavior at the main-process
  boundary;
- keep V1 startup reachable only through the explicit legacy mode;
- run the full V2, Electron, format, lint, and ARM64 package gates; and
- verify that packaged V2 resources and the existing extension roots remain
  discoverable without adding generated artifacts to the repository.
