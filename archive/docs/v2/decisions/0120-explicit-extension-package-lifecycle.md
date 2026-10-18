# ADR 0120: Add an explicit external-extension package lifecycle

- Status: Accepted
- Date: 2026-09-01

## Context

ADR 0119 gives packaged V2 separate local, Raycast-curated, and external
catalog roots, but the external root is currently only a directory that the
application creates. A host-side operation is needed to put a user-selected
extension package there safely and to recover from an update or removal.

The first lifecycle slice must remain explicit and deterministic. It must not
turn a command launch into a network install, execute package-manager scripts,
or make the Electron renderer responsible for filesystem paths.

## Decision

Add a Node-only `ExternalExtensionStore` under `@blastlauncher/core-node`.
It accepts a user-selected extension directory or local tar archive (`.tgz`,
`.tar.gz`, or `.tar`) and:

1. copies or extracts it into a temporary staging area outside the catalog;
2. rejects unsafe archive paths, symbolic/hard links, special filesystem
   entries, malformed manifests, empty command lists, and commands whose
   entrypoints cannot be resolved inside the staged package;
3. atomically activates the validated package under the external root using a
   storage-safe directory name derived from its manifest name;
4. keeps one recoverable previous package per extension for update and remove;
   `rollback` swaps that package back into the active location; and
5. invokes an optional catalog refresh callback only after a successful
   activation, update, removal, or rollback.

Install does not overwrite an existing package. Update requires an active
package, remove moves it to the recoverable backup slot, and rollback requires
that slot. Operations return host-side package metadata including extension ID,
version when present, and the managed directory; this metadata never enters
the extension runtime context or client protocol.

The store bounds archive entry count and expanded bytes, rejects symlink-based
package layouts, and cleans failed staging work. It does not resolve npm
package names, access the network, run npm/pnpm, install third-party
dependencies, verify signatures, or provide sandboxing. Dependencies must
already be present in the imported package or be provisioned through the
existing explicit local/vendored bundler policy.

## Boundary

This is a host-owned filesystem lifecycle API. Electron UI/IPC, remote package
catalogs, curated artifact indexes, lockfile/audit provisioning, and stronger
verification remain separate follow-up boundaries.

## Consequences

An application or future CLI can offer explicit import/update/remove controls
without weakening the runtime's no-implicit-install rule. Failed validation
does not change the active catalog, and an update or remove can be reversed
through the single backup slot. The external catalog remains a direct-package
root, so arbitrary npm layouts still need a future importer rather than being
silently interpreted by the catalog.

## Verification

- directory and tar archive imports validate the same manifest and entrypoint
  rules;
- traversal, absolute paths, links, special entries, malformed packages,
  oversized archives, and failed staging leave no active mutation;
- install/update/remove/rollback preserve deterministic package identity and
  recoverable backup behavior;
- refresh is called exactly once after each successful mutation and never after
  a rejected operation; and
- focused Node tests, the full build, lint, format, and the existing ARM64
  application checks remain required without generating corpus bundles.
