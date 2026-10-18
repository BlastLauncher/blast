# ADR 0125: Extension dependency provisioning

- Status: Accepted
- Date: 2026-09-03

## Context

Third-party dependency failures are the largest corpus loss class (575 of
3,231 extensions): the esbuild bundler cannot resolve an extension-owned
`import` because the probe never installs packages. The stopgap is seventeen
bounded, exact-version, development-only vendor seeds (223 portable JavaScript
packages) in `@blastlauncher/e2e`; each round moves only a handful of
extensions and the tail is unbounded. The runtime contract is explicit: the
extension process never installs or downloads dependencies. The final product
must run every Raycast extension, so this stopgap cannot close the gap: each
extension resolves its own dependency graph from its own manifest, and only a
host-owned installer can provide it. Upstream Raycast extensions are manually
reviewed and tested before publishing, so the installer does not need
supply-chain policy checks (audits, script allowlists, registry gating) —
it only needs reproducible, isolated resolution.

## Options considered

- **A. Per-extension install at import time.** The trusted host installs the
  extension's manifest graph into an isolated per-extension store on first
  run, then bundles against it. Reproducible per extension, no cross-extension
  version conflicts, unbounded disk use without eviction.
- **B. Shared content-addressed cache.** One managed store keyed by package
  integrity, shared across extensions. Disk-efficient, but one resolution
  policy must satisfy every extension graph and cache poisoning has blast
  radius across extensions.
- **C. Vendored allowlist forever (status quo).** Reviewable and safe, but
  each new package needs a workspace seed round; the 575-failure tail never
  closes and every corpus extension stays one missing package away from
  red.
- **D. Require authors to bundle.** Incompatible with the product goal: the
  corpus is upstream Raycast extensions and will not change for Blast.

## Decision

Hybrid A+B: a host-owned installer implements per-extension isolation over a
shared content-addressed download cache.

- The installer runs in the trusted host process only — never in the
  extension runtime. It resolves the extension manifest's `dependencies`
  against the default public registry, records exact versions and integrity
  hashes in a per-extension lockfile stored alongside the installed package,
  and materializes an isolated `node_modules` view per extension identity.
- The esbuild bundle step resolves bare imports from exactly two roots: the
  extension's isolated view and the existing explicit vendored roots.
  Extension code cannot reach outside either root.
- Network access exists only in the installer. The extension runtime keeps
  its current property: no installs, no downloads.
- No dependency policy checks: upstream extensions are manually reviewed and
  tested, so there is no audit step, no lifecycle-script allowlist, and no
  registry gating. Scripts run as the package manager runs them; a package
  that fails to install or build surfaces the manager's error as a
  structured `dependency_install_failed` diagnostic.
- Native addons, WASM artifacts, macOS-only binaries, and host-process
  helpers that cannot build or load on the current platform are reported
  with structured `dependency_platform_unsupported` diagnostics; they are
  classified per-package, not per-API, so they never pollute the
  compatibility percentage.
- Operational bounds stay, without trust semantics: maximum install size per
  extension, maximum cache size with least-recently-used eviction, and an
  offline mode that resolves from cache only and reports uncached graphs as
  structured `dependency_offline_unavailable` failures.
- First-run installation is visible and retryable in the client (the ADR
  0115 installer pattern): progress state, failure code, and retry — never a
  silent hang.

## Boundary

This decision does not add automatic extension updates, a package registry,
or sandboxing beyond process isolation; those remain separate boundaries. No
supply-chain verification is added because the reviewed upstream corpus is
trusted — if that assumption ever changes, policy checks return as their own
decision. The existing development-only vendor seeds stay for hermetic tests
and probes; production resolution never reads workspace `devDependencies`.

## Consequences

The dependency-failure loss class becomes closable extension by extension
instead of seed round by seed round. Corpus measurement splits cleanly:
missing-API failures stay in the compatibility percentage, while uninstalled,
lifecycle-blocked, platform-blocked, and offline graphs become classified
installer diagnostics with their own closure policy. Disk, network, and
install-script risk move behind explicit host policy instead of living in
seventeen ad-hoc seed rounds.

## Verification

- Installer unit tests: exact-version lockfile round-trip, isolated views do
  not leak across extension identities, install/build failures surface as
  structured diagnostics, quotas and offline-cache behavior.
- A focused reprobe of previously `third-party-dependency` extensions with
  provisioning enabled renders a deterministic subset; the probe report
  distinguishes `renders` from the new structured dependency diagnostics.
- `pnpm run lint` and `pnpm run fmt:check`.
