# `@blastlauncher/e2e`

End-to-end vertical slice fixtures for Blast V2.

The package proves the complete extension-to-client path without Electron or a
daemon: a filesystem catalog resolves the fixture identity, the Node launcher
starts the fixed bootstrap in a dedicated child process, the runtime loads the
entrypoint and publishes scenes over a negotiated session, the core relays
traffic to a `SceneStateBuffer` test client, and actions and clipboard
requests flow back through the capability broker.

## Fixtures

- `catalog/scene-extension`: renders a list with one action, and on an action
  event performs a brokered clipboard write (granted) and read (denied),
  reporting both outcomes as the item subtitle;
- `catalog/crash-extension`: publishes a snapshot and then exits deliberately
  with code 43;
- `catalog/compat-extension`: a Raycast-style command written against the
  compatibility surface;
- `catalog/tsx-extension`: a Raycast-style TSX component with literal
  `@raycast/api` imports, resolved at bundle time;
- `real/`: real corpus extensions committed as trimmed fixtures with named
  expectations, run by the support matrix test
  (`docs/v2/compatibility/support-matrix.md`);
- `bootstrap.mjs`: the fixed Node runtime bootstrap the launcher spawns,
  including esbuild bundling with `@raycast/api` aliasing and compatibility
  API configuration.

Tests use bounded polling for cross-process waiting and assert observable
outcomes (exit codes, broker records, scene state) rather than timing.
