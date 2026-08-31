# ADR 0100: Package an opt-in V2 Raycast bootstrap and catalog bridge

- Status: Accepted
- Date: 2026-08-31

## Context

ADR 0098 proved that Electron can own a V2 daemon when its catalog, bootstrap,
and socket paths are supplied explicitly. The packaged Electron app currently
ships only the prototype `run.cjs`, however, and the V2 Raycast composition
exists only as an end-to-end fixture. The existing V1 installer also already
defines a user-facing extension layout:

- production packages are installed below
  `~/.blast/extensions/node_modules/@blast-extensions`;
- development packages are built below `~/.blast/dev-extensions/node_modules`;
- development packages take precedence over production packages with the same
  manifest name.

Moving extensions to a new directory would make the first V2 client path
unusable for current installs. Packaging the V2 bootstrap also needs to keep a
single React module available to both the bootstrap renderer and bundled
extension components; a plain TypeScript package entrypoint cannot assume that
Node will resolve workspace dependencies from an Electron resource directory.

## Decision

Add a small higher-level `@blastlauncher/raycast-runtime-node` package that
composes the existing Node lifecycle bootstrap with the measured Raycast
adapter. Its build emits two standalone CommonJS resources:

- `v2-bootstrap.cjs`, the fixed child-process entrypoint that uses stdio for
  the V2 protocol, bundles extension entrypoints, configures the Raycast
  adapter, and renders default-exported command components;
- `v2-raycast-api.cjs`, the adapter bundle used as the launcher's explicit
  `@raycast/api` alias while an extension entrypoint is bundled.

React remains external to both resources. Forge copies the bootstrap, adapter,
and one React package directory to the application resources. The Electron
daemon passes the resource directory through `NODE_PATH` and supplies explicit
adapter and React paths to children. Extension dependencies remain governed by
the existing local or explicitly vendored bundler policy; the packaged bridge
does not install or download dependencies.

Add a `BLAST_V2_MODE=packaged` opt-in configuration. In that mode Electron
uses:

- `~/.blast/dev-extensions/node_modules` as the primary catalog root;
- `~/.blast/extensions/node_modules/@blast-extensions` as a secondary catalog
  root; and
- `~/.blast/v2/core.sock` as the owned local endpoint.

The catalog accepts ordered additional roots and keeps the first valid
manifest for a duplicate extension name, so the existing development-over-
production precedence is retained. The primary root remains the existing
single-root API for callers that do not need a second installation channel.
Missing optional additional roots are ignored; an unreadable primary root
still fails closed as before.

Packaged mode is explicit and does not become the default in this slice. The
socket-only external daemon mode and the V1 WebSocket/runtime path remain
available. Native OS menu-bar registration, extension installation UI, and
the eventual V2 default cutover remain separate boundaries.

## Boundary

This makes the existing V1 installation layout consumable by an opt-in,
packaged V2 daemon and gives the daemon a relocatable bootstrap resource. It
does not promise that every installed extension renders, provision third-party
dependencies, or provide host capabilities that are not yet implemented.

## Consequences

The first packaged V2 smoke path can use existing production or development
extensions without a migration copy. A duplicate manifest is deterministic,
and the app can roll back to V1 by removing the explicit mode or by failing
V2 startup. The packaged resources add a small duplicate adapter bundle and
React runtime to the application, while avoiding a runtime dependency on the
workspace's package layout.

## Verification

- test ordered multi-root catalog discovery and optional-root behavior;
- build and syntax-check the standalone bootstrap resources;
- verify the packaged path resolver and explicit-mode fallback rules;
- run the full V2 suite, Electron tests, lint, and format checks; and
- package the Electron app for Linux/arm64 and confirm the three V2 resources
  are present without launching the UI.
