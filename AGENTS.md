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

V2 is being developed alongside the prototype:

- `packages/blast-protocol/` — transport-independent V2 messages and schemas.
- `packages/blast-extension-host/` — V2 extension lifecycle boundary.
- `docs/v2/` — accepted product direction, architecture, decisions, and migration plan.

V2 packages must not import from the prototype packages' `src/` directories.
Keep `@blastlauncher/protocol` independent of React, Electron, Node.js runtime
APIs, and concrete transports.

## Toolchain

- Use Node.js 24.20.0 or newer. `.nvmrc` pins the baseline CI/runtime to
  Node 24.20.0.
- Use pnpm 11.24.0 through Corepack. The package manager version is pinned in
  `package.json` and the lockfile is generated with that version.
- Install with the lockfile enforced:

  ```bash
  pnpm install --frozen-lockfile
  ```

The workspace uses pnpm 11's explicit `allowBuilds` policy for native Electron,
esbuild, and WebSocket dependencies. `blockExoticSubdeps` is disabled because
the current Electron Forge graph still consumes `@electron/node-gyp` from git.
Keep both settings intentional when changing the Electron toolchain.

Some major-version upgrades remain deliberate follow-ups: the runtime still
emits CommonJS, so `node-fetch` and `tar` stay on their compatible lines;
Tailwind remains on v3 until its CSS/PostCSS migration is planned; and
TypeScript remains on 5.9 while the current `ts-jest` and package boundaries
are modernized further.

## Common commands

Run from the repository root unless noted otherwise:

```bash
# Build all five workspace packages
pnpm run build

# Run backend/runtime watchers
pnpm run watch

# In a second terminal, start the Electron client
pnpm run start:client

# Lint the workspace with Oxlint
pnpm run lint

# Check or rewrite formatting with Oxfmt
pnpm run fmt:check
pnpm run fmt

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
test files but is configured to pass cleanly with no tests. Jest 30 and
TypeScript 5.9 are shared by the workspace test runners.

Oxlint is the linting entry point and Oxfmt is the formatting entry point. Their
root configuration files are `.oxlintrc.json` and `.oxfmtrc.json`; generated
artifacts are ignored there rather than through the removed ESLint/Prettier
ignore files.

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

## V2 direction

Blast V2 is a clean-slate implementation within the existing repository. Its
goal is a small, open runtime for a measured subset of Raycast-compatible
extensions. The launcher is the first client, not part of the extension runtime
contract. Read `docs/v2/` before changing V2 public behavior.

Recommended implementation order:

1. Establish the versioned, transport-neutral protocol and lifecycle boundary.
2. Measure API usage in the public extension corpus.
3. Complete one isolated extension-to-client vertical slice.
4. Expand compatibility in measured order with deterministic fixtures.
5. Cut the desktop client over only after the V2 path is proven.

Do not couple V2 to V1 internals for short-term reuse, and do not remove V1 until
the migration criteria in `docs/v2/migration.md` are satisfied.
