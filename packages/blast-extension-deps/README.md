# `@blastlauncher/extension-deps`

Host-owned per-extension dependency installer for Blast V2 ([ADR
0125](../../docs/v2/decisions/0125-extension-dependency-provisioning.md)).

`ensureExtensionDependencies` resolves an extension manifest's runtime
`dependencies` with the system package manager in the trusted host process,
records exact versions in a per-extension lockfile, and materializes an
isolated `node_modules` view per extension identity. The extension runtime
never installs or downloads anything: the bundler simply resolves bare
imports from the returned view alongside the explicit vendored roots.

The reviewed upstream corpus is trusted, so there are no supply-chain policy
checks — install or build failures surface as structured diagnostics
(`dependency_install_failed`, `dependency_platform_unsupported`,
`dependency_offline_unavailable`) instead.

This package does not depend on React, Electron, the protocol session, or a
bundler. Callers that need another transport or installer UI consume the
returned view path and the structured error codes.
