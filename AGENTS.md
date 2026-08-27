# Blast Launcher Agent Guide

## Project overview

Blast is an experimental Electron launcher for Raycast-compatible extensions. The
repository is a pnpm workspace; the related Blast packages live here rather than
in separate local repositories.

The main data flow is:

1. `@blastlauncher/api` provides the Raycast API-compatible component surface.
2. `@blastlauncher/runtime` runs extension code and uses the custom renderer.
3. `@blastlauncher/renderer` serializes the React element tree.
4. The Electron client renders the tree and provides the desktop application.
5. `@blastlauncher/cli` builds and publishes extension packages.

## Repository layout

- `apps/electron-client/` — Electron/React desktop client.
- `packages/blast-api/` — `@blastlauncher/api` implementation.
- `packages/blast-cli/` — `@blastlauncher/cli` build and publish tool.
- `packages/blast-renderer/` — custom React renderer.
- `packages/blast-runtime/` — extension runtime and backend.
- `packages/blast-utils/` — shared utilities, including Node runtime helpers.
- `docs/` — product and application-flow documentation.

## Toolchain

- Use Node.js 18 or newer. `.nvmrc` pins the baseline CI/runtime to Node 18.20.8.
- Use pnpm 9.x for compatibility with the existing CI and lockfile. The local
  setup has pnpm 9.15.9 activated through Corepack.
- Install with the lockfile enforced:

  ```bash
  pnpm install --frozen-lockfile
  ```

When modernizing dependencies, update the supported Node and pnpm versions as an
intentional change. Do not regenerate the lockfile with an unrelated pnpm major.

## Common commands

Run from the repository root unless noted otherwise:

```bash
# Build all five workspace packages
pnpm run build

# Run backend/runtime watchers
pnpm run watch

# In a second terminal, start the Electron client
pnpm run start:client

# Lint the workspace
pnpm run lint

# Run all available workspace tests serially
pnpm run test

# Package the Electron application without distro makers
pnpm --filter blast run package

# Build configured distributables
pnpm --filter blast run make
```

On Linux, the configured full `make` command includes an RPM target and requires
`rpmbuild`. A Debian-only build can be run with:

```bash
cd apps/electron-client
pnpm exec electron-forge make --targets @electron-forge/maker-deb
```

## Testing

The root test command runs available package tests serially:

```bash
pnpm --filter @blastlauncher/api run test
pnpm --filter @blastlauncher/renderer run test
pnpm --filter @blastlauncher/utils run test
```

The renderer test configuration ignores generated `dist` files. The utils NRM
tests use a local compressed archive and mocked HTTPS response, so they do not
depend on Node.js downloads or network timing. The API package currently has no
test files but is configured to pass cleanly with no tests.

## Change guidelines

- Preserve workspace package names and use `workspace:*` for internal package
  dependencies.
- Keep source changes under the relevant `src/` directory; do not commit
  `node_modules`, `dist`, `.webpack`, or Electron `out` artifacts.
- Make dependency upgrades in small, reviewable groups. Build and test after
  each group instead of combining upgrades with unrelated behavior changes.
- Preserve Raycast compatibility deliberately. If the revived product changes
  the API or extension contract, document the compatibility boundary and add a
  migration path.
- Keep Electron/runtime boundaries explicit and review IPC, filesystem, process,
  and extension-loading changes for security implications.
- Add or update tests for behavior changes. Prefer deterministic tests over
  network-dependent tests.
- Use Changesets for publishable package changes when release work begins.
- Read the package README and relevant files in `docs/` before changing a
  package's public behavior.

## Modernization direction

Before upgrading the dependency graph, agree on the revived product goal and
compatibility policy. A likely direction is a modern, cross-platform,
extensible desktop launcher with a maintained plugin SDK, secure extension
runtime, and current Node/React/Electron dependencies.

Recommended modernization order:

1. Record the current behavior and package contracts.
2. Repair CI, test discovery, and reproducible toolchain selection.
3. Upgrade TypeScript, React, Electron, and build tooling in isolated groups.
4. Harden extension execution, permissions, IPC, and runtime installation.
5. Improve the launcher UX and extension authoring/publishing workflow.

Do not begin with a broad package upgrade that silently changes the extension
contract.
