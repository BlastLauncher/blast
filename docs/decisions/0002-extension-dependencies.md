# 0002 — Extension dependency resolution and launch policy

Status: accepted 2026-10-18; absorbs 0008 and 0012

## Decision

1. Bundle resolution keeps `@raycast/api`, `react` and Node built-ins external,
   then uses an extension's matching lean install, then the optional pinned
   `@blastlauncher/shared-deps` allowlist. Other bare imports fail with a typed
   missing-dependency result. Static `require` follows the same policy; dynamic
   `require` permits only Node built-ins.
2. Lean installs happen outside the extension from its lockfile with npm
   `--omit=dev --omit=peer --ignore-scripts --no-audit --no-fund`. Supplied
   runtime packages are stripped from lockfiles; required peer repairs are
   bounded. Installs are keyed by extension manifest and lockfile and may be
   removed at any time. Corpus smoke remains offline and allowlist-only.
3. The shared fallback uses exact pinned versions and a bounded disk budget.
   Selection follows imported rank and portability filters; native addons,
   install hooks, binaries and oversized graphs are excluded. Extensions may
   declare another major; Blast warns when the provided major excludes it.
4. Launch checks dependencies before bundling. Unresolved packages produce a
   typed `missing_dependencies` result with unresolved/installable/pinned data.
   Installation is explicit per launch (`installDependencies: true`); an engine
   or serve `auto` policy may make that the default, while `false` overrides it.
5. Installed dependency code still runs only in the command child. The policy
   is not a sandbox, and no extension source is modified.

## Why

Extensions need their own pinned dependencies without turning the host into a
package manager by default. A typed preflight lets every embedder decide when
network access and third-party installation are appropriate.

## Consequences

Missing dependencies are actionable before launch, and embedders handle one
stable error shape. The shared allowlist remains a bounded fallback for offline
and corpus workflows.
