# ADR 0012: Extension bundling and the component convention

- Status: accepted
- Date: 2026-08-28

## Context

Real Raycast extensions are TSX sources with literal `@raycast/api` imports
and a default-exported command component, and they typically do not declare
`react` as a dependency. The runtime loaded plain ESM fixtures until now, so
unmodified extensions could not run.

## Decision

- `@blastlauncher/extension-runtime-node` ships
  `createBundlingEntrypointLoader`: an esbuild-based `ExtensionEntrypointLoader`
  that bundles the entrypoint (TypeScript/JSX included) to an ESM file in a
  cache directory and imports it. Only Node.js builtins stay external, so a
  bundle carries the adapter, the renderer, and React with it.
- The loader takes an alias mapping; launchers resolve `@raycast/api` to
  `@blastlauncher/raycast-compat`. Bare importers that the extension
  environment resolves (such as `react` for workspace fixtures) need no
  mapping.
- The fixed Node bootstrap gains a `renderComponent` hook: when the entrypoint
  has no `command` export but a function default export, the bootstrap passes
  the component to the hook instead of invoking a command. The hook renders
  the component through the adapter's `runCommand` and binds the API surface
  via `configureApi`. The bootstrap never imports React itself.
- The compatibility adapter keeps its command state (configured context,
  active renderer) on `globalThis`, because a bundled extension carries its
  own copy of the adapter module while the bootstrap configures another; both
  copies must share one command binding per JavaScript realm.
- Bundling failures are structured `entrypoint_load_failed` errors with the
  compiler diagnostics as details.

## Consequences

- unmodified Raycast-style TSX components run end to end over child
  processes, including brokered clipboard actions;
- the support matrix can now measure real extension fixtures instead of
  import statistics;
- bundles are rebuilt per load and cached per entrypoint hash in a temporary
  directory; the default directory is removed after the load succeeds or
  fails, while an explicitly supplied cache directory remains caller-owned;
  production cache invalidation and incremental rebuilds remain future work;
- extensions with native or large npm dependency graphs need externalization
  policy before they can load; that is measured next with real fixtures.
