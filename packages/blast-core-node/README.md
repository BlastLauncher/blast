# `@blastlauncher/core-node`

Node.js filesystem manifest catalog for Blast V2.

`FilesystemExtensionCatalog` implements the `ExtensionCatalog` interface from
`@blastlauncher/core`. It scans a root directory that contains one subdirectory
per installed extension, reads each Raycast-style `package.json` manifest, and
resolves a stable `{ extensionId, commandName }` identity into the
`ExtensionDescriptor` the extension host requires.

## Resolution rules

- the manifest `name` is the `extensionId` and each `commands[].name` is a
  `commandName`; unrecognized manifest fields are allowed and ignored;
- extension-level preference defaults and the selected command's
  `commands[].preferences` defaults are merged into the descriptor's
  `preferences`, with command-level values taking precedence for duplicate
  names;
- when a command declares an `entrypoint`, it is resolved relative to the
  extension root and must stay inside that root; absolute paths and traversal
  are rejected with `catalog_entrypoint_outside_root`;
- otherwise the catalog probes the Raycast convention
  `src/<command-name>.tsx|.ts|.jsx|.js|.mjs|.cjs` and fails with
  `catalog_entrypoint_missing` when no candidate exists;
- manifests that cannot be read, parsed, or validated are skipped so one broken
  install cannot hide the rest of the catalog; the first sorted directory
  claiming a manifest name wins, making duplicate installations deterministic;
- a missing catalog root fails with `catalog_root_unreadable` instead of
  silently resolving nothing.

The catalog resolves paths on every request and keeps no persistent state; a
persistent, watched index and installation flows are deliberate later slices.

## Boundaries

This package may use Node.js APIs. It must not depend on Electron, React, the
prototype packages, or any concrete transport, and it must not make
`@blastlauncher/core` depend on Node.
